import { computed, ref, shallowRef, watch, onScopeDispose } from 'vue'
import { useRoute } from 'vue-router'
import { projectsApi, versionsApi } from '@/modules/protohub-manager-ui/api'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import { previewIdentity } from '@/modules/protohub-manager-ui/utils/preview-location'
import { runtimePageUrl } from '@/modules/protohub-manager-ui/utils/urls'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import type { WorkspaceContext } from '@/modules/protohub-manager-ui/types'

/** Exchange a member session only on entry or an explicit retry; expiry unmounts the untrusted frame. */
export function usePreview() {
  const route = useRoute()
  const data = shallowRef<WorkspaceContext>()
  const loading = ref(false)
  const error = ref('')
  const expired = ref(false)
  let controller: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0

  function clear() {
    generation++
    controller?.abort()
    clearTimeout(timer)
    data.value = undefined
  }
  async function load() {
    clear()
    const current = generation
    const request = new AbortController()
    controller = request
    const locationPath = route.path
    const projectId = String(route.params.projectId)
    const versionId = String(route.params.versionId)
    const revisionId = previewIdentity(route.query.revisionId)
    const options = { signal: request.signal, silent: true }
    loading.value = true
    error.value = ''
    expired.value = false
    try {
      if (revisionId === null) throw new Error(t('proto.invalidPageTarget'))
      const [project, version] = await Promise.all([
        projectsApi.get(projectId, options),
        versionsApi.get(versionId, options),
      ])
      if (current !== generation || request.signal.aborted) return
      // URL IDs are untrusted; an accessible version cannot be paired with a different project title.
      if (
        project.id !== projectId ||
        version.projectId !== projectId ||
        !projectAllows(project, 'read')
      )
        throw new Error(t('proto.projectUnavailable'))
      if (version.migrationRequired) throw new Error(t('proto.revisionMigrationRequired'))
      // Resolve the current pointer once. Every subsequent read uses that immutable identity.
      const revision = revisionId
        ? await versionsApi.revision(versionId, revisionId, options)
        : await versionsApi.currentRevision(versionId, options)
      if (current !== generation || request.signal.aborted) return
      if (
        !revision.id ||
        revision.versionId !== versionId ||
        revision.projectId !== projectId ||
        (revisionId && revision.id !== revisionId)
      )
        throw new Error(t('proto.projectUnavailable'))
      const [pages, session] = await Promise.all([
        versionsApi.revisionPages(versionId, revision.id, options),
        versionsApi.revisionPreviewSession(versionId, revision.id, options),
      ])
      if (current !== generation || request.signal.aborted) return
      if (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now())
        throw new Error(t('proto.previewExpired'))
      runtimePageUrl(session.runtimeBaseUrl, revision.entryFile)
      data.value = {
        revisionId: revision.id,
        locationPath,
        title: project.name,
        versionName: revision.versionName,
        runtimeBaseUrl: session.runtimeBaseUrl,
        entryFile: revision.entryFile,
        pages,
      }
      timer = setTimeout(() => {
        data.value = undefined
        expired.value = true
        error.value = t('proto.previewExpired')
      }, session.expiresAt - Date.now())
    } catch (cause) {
      if (
        current !== generation ||
        request.signal.aborted ||
        (cause instanceof ApiError && cause.cancelled)
      )
        return
      data.value = undefined
      error.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (current === generation) loading.value = false
    }
  }
  let loadedScope = ''
  const key = computed(() =>
    JSON.stringify([route.params.projectId, route.params.versionId, route.query.revisionId]),
  )
  watch(
    key,
    () => {
      const scope = JSON.stringify([route.params.projectId, route.params.versionId])
      // Canonicalizing an already-authorized revision must not exchange a second runtime grant.
      if (scope === loadedScope && data.value?.revisionId === route.query.revisionId) return
      loadedScope = scope
      void load()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(clear)
  return { data, loading, error, expired, load }
}
