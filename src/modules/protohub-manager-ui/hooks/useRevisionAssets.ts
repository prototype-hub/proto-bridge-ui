import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { revisionAssetsApi } from '../api/revision-asset'
import type { Revision } from '../types'
import type { RevisionAsset, RevisionAssetPage } from '../types/revision-asset'
import { ApiError } from '@/shared/api/errors'
import { download } from '@/shared/api/client'
import { t } from '@/shared/i18n'

const PAGE_SIZE = 50

/** Selection and downloads belong to one authorized immutable revision, never the current pointer. */
export function useRevisionAssets(revision: Ref<Revision | undefined>, allowed: Ref<boolean>) {
  const data = shallowRef<RevisionAssetPage>()
  const selection = shallowRef(new Map<string, RevisionAsset>())
  const search = ref('')
  const appliedSearch = ref('')
  const pageIndex = ref(0)
  const loading = ref(false)
  const error = ref('')
  const downloading = ref(false)
  const downloadError = ref('')
  let generation = 0
  let querySequence = 0
  let queryController: AbortController | undefined
  let downloadController: AbortController | undefined

  function cancelDownload() {
    downloadController?.abort()
    downloadController = undefined
    downloading.value = false
  }
  function clear() {
    generation++
    querySequence++
    queryController?.abort()
    cancelDownload()
    data.value = undefined
    selection.value = new Map()
    search.value = appliedSearch.value = ''
    pageIndex.value = 0
    loading.value = false
    error.value = downloadError.value = ''
  }
  function unavailable(cause: unknown) {
    return cause instanceof ApiError && [401, 403, 404, 409].includes(cause.status)
  }
  function message(cause: unknown) {
    if (unavailable(cause)) return t('proto.assetsUnavailable')
    if (cause instanceof ApiError && cause.status === 413) return t('proto.assetsTooLarge')
    if (cause instanceof ApiError && cause.status === 429) return t('proto.assetsBusy')
    return cause instanceof Error ? cause.message : t('common.unknown')
  }
  function invalidate() {
    generation++
    cancelDownload()
    data.value = undefined
    selection.value = new Map()
  }
  async function load() {
    const target = revision.value
    if (!allowed.value || !target || downloading.value) return
    const current = generation
    const sequence = ++querySequence
    queryController?.abort()
    const request = new AbortController()
    queryController = request
    data.value = undefined
    loading.value = true
    error.value = downloadError.value = ''
    try {
      const result = await revisionAssetsApi.list(
        target.versionId,
        target.id,
        { pageIndex: pageIndex.value, pageSize: PAGE_SIZE, search: appliedSearch.value },
        { signal: request.signal, silent: true },
      )
      if (current !== generation || sequence !== querySequence || request.signal.aborted) return
      if (
        result.projectId !== target.projectId ||
        result.versionId !== target.versionId ||
        result.revisionId !== target.id ||
        result.manifestSha256 !== target.manifestSha256 ||
        result.pageIndex !== pageIndex.value ||
        result.pageSize !== PAGE_SIZE
      ) {
        invalidate()
        throw new Error(t('proto.assetsUnavailable'))
      }
      data.value = result
    } catch (cause) {
      if (request.signal.aborted || sequence !== querySequence) return
      if (unavailable(cause)) invalidate()
      error.value = message(cause)
    } finally {
      if (sequence === querySequence) loading.value = false
    }
  }
  function query() {
    if (downloading.value) return
    appliedSearch.value = search.value
    pageIndex.value = 0
    void load()
  }
  function resetSearch() {
    search.value = ''
    query()
  }
  function page(value: number) {
    if (loading.value || downloading.value || !data.value) return
    pageIndex.value = value - 1
    void load()
  }
  function select(asset: RevisionAsset, checked: boolean) {
    if (!allowed.value || !data.value || downloading.value) return
    const next = new Map(selection.value)
    if (checked) next.set(asset.path, asset)
    else next.delete(asset.path)
    selection.value = next
  }
  function selectPage(checked: boolean) {
    if (!allowed.value || !data.value || downloading.value) return
    const next = new Map(selection.value)
    for (const asset of data.value.data) {
      if (checked) next.set(asset.path, asset)
      else next.delete(asset.path)
    }
    selection.value = next
  }
  function clearSelection() {
    if (!downloading.value) selection.value = new Map()
  }
  async function save(format: 'file' | 'zip' | 'manifest', all = false, asset?: RevisionAsset) {
    const target = revision.value
    if (!allowed.value || !target || !data.value || loading.value || downloading.value) return
    const paths = all ? [] : asset ? [asset.path] : [...selection.value.keys()]
    if ((!all && !paths.length) || (format === 'file' && (all || paths.length !== 1))) return
    const current = generation
    const request = new AbortController()
    downloadController = request
    downloading.value = true
    downloadError.value = ''
    try {
      const binary = await revisionAssetsApi.download(
        target.versionId,
        target.id,
        format,
        { expectedManifestSha256: target.manifestSha256, all, paths },
        { signal: request.signal, silent: true, timeout: 0 },
      )
      // A late successful binary must not be saved after close, cancellation or permission loss.
      if (current !== generation || request.signal.aborted || !allowed.value) return
      await download(binary)
    } catch (cause) {
      if (current !== generation || request.signal.aborted) return
      if (unavailable(cause)) invalidate()
      downloadError.value = message(cause)
    } finally {
      if (downloadController === request) {
        downloadController = undefined
        downloading.value = false
      }
    }
  }
  const selectedCount = computed(() => selection.value.size)
  const selectedBytes = computed(() =>
    [...selection.value.values()].reduce((sum, asset) => sum + asset.size, 0),
  )
  const pageSelectedCount = computed(
    () => data.value?.data.filter((asset) => selection.value.has(asset.path)).length || 0,
  )
  watch(
    () => [
      allowed.value,
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
    selection,
    search,
    appliedSearch,
    loading,
    error,
    downloading,
    downloadError,
    selectedCount,
    selectedBytes,
    pageSelectedCount,
    load,
    query,
    resetSearch,
    page,
    select,
    selectPage,
    clearSelection,
    save,
    cancelDownload,
  }
}
