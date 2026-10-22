import { computed, ref, shallowRef, watch, onScopeDispose, type Ref } from 'vue'
import type { Dayjs } from 'dayjs'
import { useRouter } from 'vue-router'
import { sharesApi } from '@/modules/protohub-manager-ui/api'
import { applicationUrl } from '@/modules/protohub-manager-ui/utils/urls'
import { shareValidity } from '@/modules/protohub-manager-ui/utils/share'
import { t } from '@/shared/i18n'
import { ApiError } from '@/shared/api/errors'
import { useTask } from '@/shared/composables/useTask'
import { useResource } from '@/shared/composables/useResource'
import { saved, deleted } from '@/shared/utils/feedback'
import { useShareCopy } from './useShareCopy'
import type {
  Project,
  Version,
  Share,
  ShareRevisionMode,
  ShareUpdate,
} from '@/modules/protohub-manager-ui/types'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
/** Own share actions and the clock used by validity labels while this dialog is open. */
export function useShares(version: Ref<Version | undefined>, project: Ref<Project | undefined>) {
  const router = useRouter()
  const task = useTask()
  const revisionMode = ref<ShareRevisionMode>('fixed')
  const editTarget = shallowRef<Share>()
  const description = ref('')
  const password = ref('')
  const expires = ref<Dayjs>()
  const shareCopy = useShareCopy(
    computed(() =>
      version.value && project.value && projectAllows(project.value, 'manageShares')
        ? {
            projectId: project.value.id,
            projectName: project.value.name,
            versionId: version.value.id,
            versionName: version.value.versionName,
          }
        : undefined,
    ),
    (share) => url(share),
  )
  let generation = 0
  const resource = useResource<Share[]>((signal) => {
    resource.data.value = []
    return version.value && projectAllows(project.value, 'manageShares')
      ? sharesApi.list(version.value.id, { signal, silent: true })
      : Promise.resolve([])
  }, [])
  watch(resource.data, (rows) => shareCopy.synchronize(rows), { flush: 'sync' })
  const now = ref(Date.now())
  let clock: ReturnType<typeof setInterval> | undefined
  const stopClock = () => {
    if (clock !== undefined) clearInterval(clock)
    clock = undefined
  }
  // Expiry can pass while the dialog stays open; never retain a timer after closing or disposal.
  watch(
    () => [version.value, project.value?.id, project.value?.capabilities?.manageShares],
    () => {
      generation += 1
      editTarget.value = undefined
      revisionMode.value = 'fixed'
      task.error.value = ''
      resource.data.value = []
      stopClock()
      now.value = Date.now()
      description.value = ''
      password.value = ''
      expires.value = undefined
      void resource.load()
      if (version.value && projectAllows(project.value, 'manageShares')) {
        clock = setInterval(() => {
          now.value = Date.now()
        }, 1000)
      }
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    generation += 1
    stopClock()
  })
  /** Capture the submitted password before the form is cleared or a new version is selected. */
  async function create() {
    if (
      !version.value ||
      version.value.migrationRequired ||
      !projectAllows(project.value, 'manageShares')
    )
      return
    const selectedVersion = version.value
    const rawDescription = description.value.trim()
    const rawPassword = password.value
    const selectedExpiry = expires.value?.valueOf()
    const creationGeneration = generation
    await task.run(async () => {
      const created = await sharesApi.create(selectedVersion.id, {
        description: rawDescription || undefined,
        password: rawPassword || undefined,
        expiresAt: selectedExpiry,
        revisionMode: revisionMode.value,
      })
      // A late creation must not repopulate plaintext after its share dialog has closed or changed.
      if (creationGeneration !== generation) return
      description.value = ''
      password.value = ''
      saved()
      await resource.load()
      if (creationGeneration === generation) shareCopy.remember(created, rawPassword)
    })
  }
  const matches = (share: Share) =>
    version.value?.id === share.versionId &&
    project.value?.id === share.projectId &&
    projectAllows(project.value, 'manageShares')
  function edit(share: Share) {
    if (!matches(share) || share.revoked || task.busy.value) return
    task.error.value = ''
    shareCopy.cancel()
    editTarget.value = share
  }
  function closeEdit() {
    editTarget.value = undefined
  }
  /** Never retry a stale write: refresh the authoritative row and require a new explicit intent. */
  async function mutate(share: Share, action: () => Promise<Share>, rawPassword?: string) {
    if (!matches(share) || share.revoked) return
    const submittedGeneration = generation
    shareCopy.forget(share.id)
    await task.run(async () => {
      try {
        const changed = await action()
        if (submittedGeneration !== generation) return
        if (!matches(changed) || changed.id !== share.id) throw new Error(t('proto.unavailable'))
        editTarget.value = undefined
        resource.data.value = resource.data.value.map((row) =>
          row.id === changed.id ? changed : row,
        )
        if (rawPassword !== undefined) shareCopy.remember(changed, rawPassword)
        saved()
      } catch (cause) {
        if (submittedGeneration !== generation) return
        if (cause instanceof ApiError && cause.status === 409) {
          editTarget.value = undefined
          await resource.load()
          throw new Error(t('proto.shareConflict'))
        }
        if (cause instanceof ApiError && !cause.status && !cause.cancelled)
          throw new Error(t('proto.shareMutationUnknown'))
        throw cause
      }
    })
  }
  async function update(input: ShareUpdate) {
    const share = editTarget.value
    if (!share || input.expectedVersion !== share.configVersion) return
    await mutate(
      share,
      () => sharesApi.update(share.id, input, { silent: true }),
      input.passwordAction === 'replace' ? input.password : undefined,
    )
  }
  const setEnabled = (share: Share) =>
    mutate(share, () =>
      sharesApi.enabled(share.id, share.configVersion, !share.enabled, { silent: true }),
    )
  const revoke = (share: Share) =>
    mutate(share, () => sharesApi.revoke(share.id, share.configVersion, { silent: true }))
  const rotate = (share: Share) =>
    mutate(share, () => sharesApi.rotate(share.id, share.configVersion, { silent: true }))
  async function remove(id: string) {
    if (!projectAllows(project.value, 'manageShares')) return
    const submittedGeneration = generation
    shareCopy.forget(id)
    await task.run(async () => {
      await sharesApi.remove(id)
      if (submittedGeneration !== generation) return
      shareCopy.forget(id)
      deleted()
      await resource.load()
    })
  }
  const url = (share: Share) => applicationUrl(router, `/share/${encodeURIComponent(share.token)}`)
  const validity = (share: Share) => shareValidity(share, now.value)
  return {
    task,
    resource,
    revisionMode,
    editTarget,
    edit,
    closeEdit,
    update,
    setEnabled,
    revoke,
    rotate,
    description,
    password,
    expires,
    create,
    remove,
    url,
    copy: shareCopy.copy,
    validity,
    shareCopy,
  }
}
