import { computed, ref, shallowRef, watch, onScopeDispose, type Ref } from 'vue'
import { versionsApi } from '@/modules/protohub-manager-ui/api'
import { download } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import type { Revision, RevisionQuality } from '@/modules/protohub-manager-ui/types'

const PAGE_SIZE = 50

/** Own one report: closing, changing revision, or losing access discards every pending result. */
export function useRevisionQuality(revision: Ref<Revision | undefined>, allowed: Ref<boolean>) {
  const data = shallowRef<RevisionQuality>()
  const loading = ref(false)
  const error = ref('')
  const downloading = ref(false)
  const downloadError = ref('')
  const pageIndex = ref(0)
  let controller: AbortController | undefined
  let generation = 0

  function clear() {
    generation++
    controller?.abort()
    data.value = undefined
    loading.value = false
    error.value = ''
    downloading.value = false
    downloadError.value = ''
    pageIndex.value = 0
  }
  async function load() {
    const selected = revision.value
    if (!allowed.value || !selected) return
    clear()
    const current = generation
    const request = new AbortController()
    controller = request
    loading.value = true
    try {
      const report = await versionsApi.quality(selected.versionId, selected.id, {
        signal: request.signal,
        silent: true,
      })
      if (current !== generation || request.signal.aborted) return
      if (
        report.versionId !== selected.versionId ||
        report.revisionId !== selected.id ||
        report.manifestSha256.toLowerCase() !== selected.manifestSha256.toLowerCase()
      )
        throw new Error(t('proto.projectUnavailable'))
      data.value = report
    } catch (cause) {
      if (
        current !== generation ||
        request.signal.aborted ||
        (cause instanceof ApiError && cause.cancelled)
      )
        return
      error.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (current === generation) loading.value = false
    }
  }
  const rows = computed(() =>
    (data.value?.findings || [])
      .slice(pageIndex.value * PAGE_SIZE, (pageIndex.value + 1) * PAGE_SIZE)
      .map((finding, index) => ({ ...finding, id: String(pageIndex.value * PAGE_SIZE + index) })),
  )
  const pagination = computed(() => ({
    current: pageIndex.value + 1,
    pageSize: PAGE_SIZE,
    total: data.value?.findings.length || 0,
    showSizeChanger: false,
  }))
  function page(value: number) {
    pageIndex.value = Math.max(
      0,
      Math.min(value - 1, Math.ceil((data.value?.findings.length || 0) / PAGE_SIZE) - 1),
    )
  }
  /** Export exactly the displayed scan, including omitted counts; never issue another scan. */
  async function exportReport() {
    const report = data.value
    if (!allowed.value || !report || downloading.value) return
    const current = generation
    downloading.value = true
    downloadError.value = ''
    try {
      await download({
        blob: new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
        filename: `prototype-quality-${encodeURIComponent(report.versionId)}-${encodeURIComponent(report.revisionId)}.json`,
        contentType: 'application/json',
      })
    } catch (cause) {
      if (current === generation)
        downloadError.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (current === generation) downloading.value = false
    }
  }
  watch(
    () => [
      allowed.value,
      revision.value?.versionId,
      revision.value?.id,
      revision.value?.manifestSha256,
    ],
    () => {
      clear()
      if (allowed.value && revision.value) void load()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(clear)
  return {
    data,
    loading,
    error,
    downloading,
    downloadError,
    rows,
    pagination,
    load,
    page,
    exportReport,
  }
}
