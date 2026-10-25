import { computed, ref, shallowRef, watch, onScopeDispose } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { projectsApi, versionsApi } from '@/modules/protohub-manager-ui/api'
import { applicationUrl } from '@/modules/protohub-manager-ui/utils/urls'
import { useResource } from '@/shared/composables/useResource'
import { usePrototypeList } from './usePrototypeList'
import { useTask } from '@/shared/composables/useTask'
import { deleted } from '@/shared/utils/feedback'
import { ApiError } from '@/shared/api/errors'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import { recycleListLocation } from '@/modules/protohub-manager-ui/utils/project-navigation'
import { useSession } from '@/app/stores/session'
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
  const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))
  const task = useTask()
  const legacyRecycle = computed(() => route.query.recycle === 'versions')
  const session = useSession()
  let generation = 0
  const permissions = usePermissions()
  const uploadOpen = ref(false)
  const uploadContext = ref<UploadContext>({ projectId: id.value })
  const shareVersion = ref<Version>()
  const historyVersion = ref<Version>()
  const membersOpen = ref(false)
  const usage = useResource<VersionUsage | undefined>(
    (signal) =>
      !!id.value && !legacyRecycle.value && permissions.can(p.version.query)
        ? versionsApi.usage(id.value, { signal, silent: true })
        : Promise.resolve(undefined),
    undefined,
  )
  const project = shallowRef<Project>()
  const list = usePrototypeList<Version>(
    async (query, options) => {
      if (!id.value || legacyRecycle.value)
        return { data: [], total: 0, pageIndex: 0, pageSize: query.pageSize || 20 }
      try {
        const projectId = id.value
        const loaded = await projectsApi.get(projectId, options)
        if (options.signal?.aborted) return { data: [], total: 0, pageIndex: 0, pageSize: 20 }
        if (loaded.id !== projectId) throw new Error(t('proto.projectUnavailable'))
        project.value = loaded
        if (!projectAllows(loaded, 'manageMembers')) membersOpen.value = false
        // Project administration does not imply permission to query its version contents.
        const versions = permissions.can(p.version.query)
          ? await versionsApi.query(projectId, query, options)
          : { data: [], total: 0, pageIndex: 0, pageSize: query.pageSize || 20 }
        if (versions.data.some((version) => version.projectId !== loaded.id))
          throw new Error(t('proto.projectUnavailable'))
        return versions
      } catch (cause) {
        if (!options.signal?.aborted) {
          project.value = undefined
          membersOpen.value = false
        }
        throw cause
      }
    },
    () => {
      // Member changes revalidate the same project in place; failed checks and scope changes close it.
      if (!membersOpen.value) project.value = undefined
      uploadOpen.value = false
      shareVersion.value = undefined
      historyVersion.value = undefined
    },
  )
  const resource = {
    ...list.resource,
    data: computed({
      get: () => ({ project: project.value, versions: list.resource.data.value }),
      set: (value) => {
        project.value = value.project
        list.resource.data.value = value.versions
      },
    }),
  }
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
    const submitted = generation
    await task.run(async () => {
      try {
        await versionsApi.remove(key)
      } catch (cause) {
        if (submitted !== generation) return
        // A concurrently deleted version must not leave its old controls available in the list.
        if (cause instanceof ApiError && cause.status === 404) await refresh()
        throw cause
      }
      if (submitted !== generation) return
      deleted()
      await refresh()
    })
  }
  onScopeDispose(() => generation++)
  watch(
    () => [id.value, legacyRecycle.value],
    () => {
      generation++
      task.error.value = ''
      shareVersion.value = undefined
      historyVersion.value = undefined
      uploadOpen.value = false
      membersOpen.value = false
      list.resetScope()
      project.value = undefined
      if (!id.value) {
        void refresh()
        return
      }
      if (legacyRecycle.value) {
        // Old deep links use the actual granted menu URL, and never query deleted data here.
        const target = permissions.can(p.version.query)
          ? recycleListLocation(router, session.menus, id.value)
          : undefined
        const current = generation
        // Abort both prior resources even when this compatibility route makes no HTTP request.
        void refresh().then(() => {
          if (current === generation && !target)
            resource.error.value = t('proto.recycleUnavailable')
        })
        if (target) void router.replace(target)
        return
      }
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
    search: list.keyword,
    submitSearch: list.search,
    resetSearch: list.reset,
    sort: list.sort,
    changeSort: list.changeSort,
    pagination: list.pagination,
    page: list.page,
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
