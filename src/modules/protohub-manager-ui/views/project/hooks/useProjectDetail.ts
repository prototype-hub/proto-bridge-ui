import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { projectsApi, versionsApi } from '@/modules/protohub-manager-ui/api'
import { applicationUrl } from '@/modules/protohub-manager-ui/utils/urls'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { deleted } from '@/shared/utils/feedback'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import { t } from '@/shared/i18n'
import { usePermissions } from '@/shared/auth/provider'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import type {
  Version,
  UploadContext,
  Project,
  VersionUsage,
} from '@/modules/protohub-manager-ui/types'
export function useProjectDetail() {
  const route = useRoute()
  const router = useRouter()
  const id = computed(() => String(route.params.id))
  const task = useTask()
  const permissions = usePermissions()
  const uploadOpen = ref(false)
  const uploadContext = ref<UploadContext>({ projectId: id.value })
  const shareVersion = ref<Version>()
  const historyVersion = ref<Version>()
  const membersOpen = ref(false)
  const usage = useResource<VersionUsage | undefined>(
    (signal) =>
      permissions.can(p.version.query)
        ? versionsApi.usage(id.value, { signal, silent: true })
        : Promise.resolve(undefined),
    undefined,
  )
  const resource = useResource<{ project: Project | undefined; versions: Version[] }>(
    async (signal) => {
      // Scope changes and failed refreshes must not leave another project's controls or content mounted.
      resource.data.value = { project: undefined, versions: [] }
      uploadOpen.value = false
      shareVersion.value = undefined
      historyVersion.value = undefined
      const project = await projectsApi.get(id.value, { signal, silent: true })
      if (signal.aborted) return { project: undefined, versions: [] }
      // Project administration does not imply permission to query its version contents.
      const versions = permissions.can(p.version.query)
        ? await versionsApi.list(id.value, { signal, silent: true })
        : []
      if (project.id !== id.value || versions.some((version) => version.projectId !== project.id))
        throw new Error(t('proto.projectUnavailable'))
      return { project, versions }
    },
    { project: undefined as Project | undefined, versions: [] as Version[] },
  )
  function loadUsage() {
    usage.data.value = undefined
    return usage.load()
  }
  async function refresh() {
    await Promise.all([resource.load(), loadUsage()])
  }
  function upload(version?: Version) {
    if (!projectAllows(resource.data.value.project, 'edit') || version?.migrationRequired) return
    uploadContext.value = { projectId: id.value, version }
    uploadOpen.value = true
  }
  function preview(version: Version, revisionId?: string) {
    if (
      !projectAllows(resource.data.value.project, 'read') ||
      version.projectId !== id.value ||
      version.migrationRequired
    )
      return
    window.open(
      applicationUrl(
        router,
        router.resolve({
          name: 'PrototypeHub-preview-window',
          params: { projectId: id.value, versionId: version.id },
          query: revisionId ? { revisionId } : undefined,
        }).fullPath,
      ),
      '_blank',
      'noopener,noreferrer',
    )
  }
  async function remove(key: string) {
    if (!projectAllows(resource.data.value.project, 'edit')) return
    await task.run(async () => {
      await versionsApi.remove(key)
      deleted()
      await refresh()
    })
  }
  watch(
    id,
    () => {
      shareVersion.value = undefined
      historyVersion.value = undefined
      uploadOpen.value = false
      membersOpen.value = false
      resource.data.value = { project: undefined, versions: [] }
      void refresh()
    },
    { immediate: true, flush: 'sync' },
  )
  return {
    resource,
    usage,
    loadUsage,
    refresh,
    task,
    uploadOpen,
    uploadContext,
    shareVersion,
    historyVersion,
    membersOpen,
    upload,
    preview,
    remove,
  }
}
