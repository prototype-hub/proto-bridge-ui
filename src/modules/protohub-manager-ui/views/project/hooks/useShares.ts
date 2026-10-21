import { computed, ref, watch, onScopeDispose, type Ref } from 'vue'
import type { Dayjs } from 'dayjs'
import { useRouter } from 'vue-router'
import { sharesApi } from '@/modules/protohub-manager-ui/api'
import { applicationUrl } from '@/modules/protohub-manager-ui/utils/urls'
import { shareValidity } from '@/modules/protohub-manager-ui/utils/share'
import { useTask } from '@/shared/composables/useTask'
import { useResource } from '@/shared/composables/useResource'
import { saved, deleted } from '@/shared/utils/feedback'
import { useShareCopy } from './useShareCopy'
import type { Project, Version, Share } from '@/modules/protohub-manager-ui/types'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
/** Own share actions and the clock used by validity labels while this dialog is open. */
export function useShares(version: Ref<Version | undefined>, project: Ref<Project | undefined>) {
  const router = useRouter()
  const task = useTask()
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
    if (!version.value || !projectAllows(project.value, 'manageShares')) return
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
      })
      // A late creation must not repopulate plaintext after its share dialog has closed or changed.
      if (creationGeneration !== generation) return
      shareCopy.remember(created, rawPassword)
      description.value = ''
      password.value = ''
      saved()
      await resource.load()
    })
  }
  async function remove(id: string) {
    if (!projectAllows(project.value, 'manageShares')) return
    await task.run(async () => {
      await sharesApi.remove(id)
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
