import { computed, ref, shallowRef, watch, onScopeDispose, type Ref } from 'vue'
import { projectsApi, versionsApi } from '@/modules/protohub-manager-ui/api'
import { download } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { token } from '@/shared/auth/token'
import { i18n, t } from '@/shared/i18n'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import type { Revision, RevisionQuality } from '@/modules/protohub-manager-ui/types'

const PAGE_SIZE = 50
type ReportFormat = 'json' | 'xlsx' | 'docx'

/** Own one report: closing, changing revision, or losing access discards every pending result. */
export function useRevisionQuality(
  revision: Ref<Revision | undefined>,
  allowed: Ref<boolean>,
  actorId?: Ref<string | undefined>,
) {
  const data = shallowRef<RevisionQuality>()
  const loading = ref(false)
  const error = ref('')
  const downloading = ref(false)
  const exportingFormat = ref<ReportFormat>()
  const downloadError = ref('')
  const pageIndex = ref(0)
  let controller: AbortController | undefined
  let downloadController: AbortController | undefined
  let reportCredential: string | null | undefined
  let generation = 0

  function clear() {
    generation++
    controller?.abort()
    downloadController?.abort()
    downloadController = undefined
    reportCredential = undefined
    data.value = undefined
    loading.value = false
    error.value = ''
    downloading.value = false
    exportingFormat.value = undefined
    downloadError.value = ''
    pageIndex.value = 0
  }
  /** A replaced browser credential cannot reuse a report even when its visible permissions match. */
  function currentIdentity(current: number, credential: string | null, request: AbortController) {
    if (current !== generation || request.signal.aborted || !allowed.value) return false
    if (credential !== token.get()) {
      clear()
      error.value = t('proto.qualityAccessChanged')
      return false
    }
    return true
  }
  async function load() {
    const selected = revision.value
    if (!allowed.value || !selected) return
    clear()
    const current = generation
    const credential = token.get()
    const request = new AbortController()
    controller = request
    loading.value = true
    try {
      const report = await versionsApi.quality(selected.versionId, selected.id, {
        signal: request.signal,
        silent: true,
      })
      if (!currentIdentity(current, credential, request)) return
      if (
        report.versionId !== selected.versionId ||
        report.revisionId !== selected.id ||
        report.manifestSha256.toLowerCase() !== selected.manifestSha256.toLowerCase()
      )
        throw new Error(t('proto.projectUnavailable'))
      data.value = report
      reportCredential = credential
    } catch (cause) {
      if (
        !currentIdentity(current, credential, request) ||
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
  /** Every format uses the loaded scan; only lightweight metadata is rechecked before saving. */
  async function exportReport(format: ReportFormat = 'json') {
    const report = data.value
    const selected = revision.value
    if (!allowed.value || !report || !selected || downloading.value) return
    const current = generation
    const credential = token.get()
    if (credential !== reportCredential) {
      clear()
      error.value = t('proto.qualityAccessChanged')
      return
    }
    const target = { ...selected }
    const language = i18n.global.locale.value === 'zh' ? 'zh' : 'en'
    const request = new AbortController()
    downloadController = request
    downloading.value = true
    exportingFormat.value = format
    downloadError.value = ''
    try {
      let blob: Blob
      if (format === 'json')
        blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      else {
        const { createQualityOfficeReport } = await import('../utils/qualityOfficeReport')
        if (!currentIdentity(current, credential, request)) return
        blob = await createQualityOfficeReport(format, report, { revision: target, language })
      }
      if (!currentIdentity(current, credential, request)) return
      // Revalidate after generation, immediately before the browser download; do not rescan files.
      const [metadata, project] = await Promise.all([
        versionsApi.revision(target.versionId, target.id, { signal: request.signal, silent: true }),
        projectsApi.get(target.projectId, { signal: request.signal, silent: true }),
      ])
      if (!currentIdentity(current, credential, request)) return
      if (
        metadata.projectId !== target.projectId ||
        metadata.versionId !== target.versionId ||
        metadata.id !== target.id ||
        metadata.manifestSha256.toLowerCase() !== target.manifestSha256.toLowerCase() ||
        project.id !== target.projectId ||
        !projectAllows(project, 'read')
      )
        throw new ApiError(t('proto.qualityAccessChanged'), 409)
      await download({
        blob,
        filename: `prototype-quality-${encodeURIComponent(report.versionId)}-${encodeURIComponent(report.revisionId)}.${format}`,
        contentType: blob.type,
      })
    } catch (cause) {
      if (!currentIdentity(current, credential, request)) return
      if (cause instanceof ApiError && [401, 403, 404, 409].includes(cause.status)) {
        clear()
        error.value = t('proto.qualityAccessChanged')
      } else downloadError.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (downloadController === request) {
        downloadController = undefined
        downloading.value = false
        exportingFormat.value = undefined
      }
    }
  }
  watch(
    () => [
      allowed.value,
      actorId?.value,
      revision.value?.projectId,
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
    exportingFormat,
    downloadError,
    rows,
    pagination,
    load,
    page,
    exportReport,
  }
}
