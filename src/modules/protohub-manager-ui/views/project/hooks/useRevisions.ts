import { ref, shallowRef, watch, onScopeDispose, type Ref } from 'vue'
import { versionsApi } from '@/modules/protohub-manager-ui/api'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import type { Revision, Version } from '@/modules/protohub-manager-ui/types'

const PAGE_SIZE = 50

/** Own one history dialog and its cursor; a late page cannot refill a closed or different version. */
export function useRevisions(version: Ref<Version | undefined>, open: Ref<boolean>) {
  const rows = shallowRef<Revision[]>([])
  const loading = ref(false)
  const error = ref('')
  const hasMore = ref(false)
  let controller: AbortController | undefined
  let generation = 0

  function clear() {
    generation++
    controller?.abort()
    rows.value = []
    loading.value = false
    error.value = ''
    hasMore.value = false
  }
  async function load(more = false) {
    const selected = version.value
    if (!open.value || !selected || selected.migrationRequired || loading.value) return
    if (more && !hasMore.value) return
    if (!more) clear()
    const current = generation
    const request = new AbortController()
    controller = request
    const after = more ? rows.value.at(-1)?.id : undefined
    loading.value = true
    error.value = ''
    try {
      const result = await versionsApi.revisions(selected.id, after, PAGE_SIZE, {
        signal: request.signal,
        silent: true,
      })
      if (current !== generation || request.signal.aborted) return
      if (
        result.some(
          (row) => row.versionId !== selected.id || row.projectId !== selected.projectId || !row.id,
        )
      )
        throw new Error(t('proto.projectUnavailable'))
      const previous = more ? rows.value : []
      const ids = new Set(previous.map((row) => row.id))
      // Appends can overlap if the current pointer changed while an older cursor was in use.
      rows.value = [...previous, ...result.filter((row) => !ids.has(row.id))]
      hasMore.value = result.length === PAGE_SIZE
    } catch (cause) {
      if (
        current !== generation ||
        request.signal.aborted ||
        (cause instanceof ApiError && cause.cancelled)
      )
        return
      rows.value = []
      hasMore.value = false
      error.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (current === generation) loading.value = false
    }
  }
  watch(
    () => [
      open.value,
      version.value?.id,
      version.value?.currentRevisionId,
      version.value?.migrationRequired,
    ],
    () => {
      clear()
      if (open.value) void load()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(clear)
  return { rows, loading, error, hasMore, load }
}
