import { computed, ref, shallowRef, watch, onScopeDispose } from 'vue'
import { useRoute } from 'vue-router'
import { projectsApi, versionsApi } from '@/modules/protohub-manager-ui/api'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
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
    const projectId = String(route.params.projectId)
    const versionId = String(route.params.versionId)
    const options = { signal: request.signal, silent: true }
    loading.value = true
    error.value = ''
    expired.value = false
    try {
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
      const [pages, session] = await Promise.all([
        versionsApi.pages(versionId, options),
        versionsApi.previewSession(versionId, options),
      ])
      if (current !== generation || request.signal.aborted) return
      if (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now())
        throw new Error(t('proto.previewExpired'))
      runtimePageUrl(session.runtimeBaseUrl, version.entryFile)
      data.value = {
        title: project.name,
        versionName: version.versionName,
        runtimeBaseUrl: session.runtimeBaseUrl,
        entryFile: version.entryFile,
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
  const key = computed(() => `${route.params.projectId}/${route.params.versionId}`)
  watch(key, load, { immediate: true, flush: 'sync' })
  onScopeDispose(clear)
  return { data, loading, error, expired, load }
}
