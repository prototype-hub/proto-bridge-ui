import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { useRevisionAssets } from '@/modules/protohub-manager-ui/hooks/useRevisionAssets'
import { revisionAssetsApi } from '@/modules/protohub-manager-ui/api/revision-asset'
import { download } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import type { Revision } from '@/modules/protohub-manager-ui/types'
import type { RevisionAssetPage } from '@/modules/protohub-manager-ui/types/revision-asset'
import { hookHarness } from '../fixtures/hook-harness'

vi.mock('@/modules/protohub-manager-ui/api/revision-asset', () => ({
  revisionAssetsApi: { list: vi.fn(), download: vi.fn() },
}))
vi.mock('@/shared/api/client', () => ({ download: vi.fn().mockResolvedValue(undefined) }))
const wrappers: VueWrapper[] = []
const fixed: Revision = {
  id: 'r1',
  projectId: 'p1',
  versionId: 'v1',
  versionName: 'V1',
  entryFile: 'index.html',
  manifestSha256: 'a'.repeat(64),
  fileCount: 100,
  totalBytes: 1000,
  createdBy: 'u1',
  createdAt: 1,
}
function result(pageIndex = 0): RevisionAssetPage {
  return {
    projectId: 'p1',
    versionId: 'v1',
    revisionId: 'r1',
    manifestSha256: fixed.manifestSha256,
    pageIndex,
    pageSize: 50,
    total: 51,
    totalBytes: 510,
    assetCount: 51,
    assetBytes: 510,
    data: [
      {
        path: `images/${pageIndex}.svg`,
        size: 10,
        sha256: 'b'.repeat(64),
        mediaType: 'image/svg+xml',
      },
    ],
  }
}
function setup(initiallyAllowed = true) {
  const revision = ref<Revision | undefined>({ ...fixed }),
    allowed = ref(initiallyAllowed)
  let state!: ReturnType<typeof useRevisionAssets>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useRevisionAssets(revision, allowed)
      }),
    ),
  )
  return { state, revision, allowed }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(revisionAssetsApi.list).mockImplementation(async (_v, _r, query) =>
    result(query.pageIndex),
  )
  vi.mocked(revisionAssetsApi.download).mockResolvedValue({
    blob: new Blob(['original']),
    filename: 'original.svg',
    contentType: 'image/svg+xml',
  })
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

it('queries the fixed revision on the server and preserves exact selections across pages and search', async () => {
  const { state } = setup()
  await flushPromises()
  state.select(state.data.value!.data[0]!, true)
  state.page(2)
  await flushPromises()
  state.selectPage(true)
  state.search.value = '图.svg'
  state.query()
  await flushPromises()
  expect(state.selectedCount.value).toBe(2)
  expect(revisionAssetsApi.list).toHaveBeenLastCalledWith(
    'v1',
    'r1',
    { pageIndex: 0, pageSize: 50, search: '图.svg' },
    { signal: expect.any(AbortSignal), silent: true },
  )
  await state.save('zip')
  expect(revisionAssetsApi.download).toHaveBeenLastCalledWith(
    'v1',
    'r1',
    'zip',
    {
      expectedManifestSha256: fixed.manifestSha256,
      all: false,
      paths: ['images/0.svg', 'images/1.svg'],
    },
    { signal: expect.any(AbortSignal), silent: true, timeout: 0 },
  )
  await state.save('manifest', true)
  expect(revisionAssetsApi.download).toHaveBeenLastCalledWith(
    'v1',
    'r1',
    'manifest',
    { expectedManifestSha256: fixed.manifestSha256, all: true, paths: [] },
    expect.anything(),
  )
  await state.save('file', false, state.data.value!.data[0]!)
  expect(revisionAssetsApi.download).toHaveBeenLastCalledWith(
    'v1',
    'r1',
    'file',
    expect.objectContaining({ all: false, paths: ['images/0.svg'] }),
    expect.anything(),
  )
})
it.each(['projectId', 'versionId', 'revisionId', 'manifestSha256'] as const)(
  'rejects a mismatched %s',
  async (key) => {
    vi.mocked(revisionAssetsApi.list).mockResolvedValueOnce({ ...result(), [key]: 'wrong' })
    const { state } = setup()
    await flushPromises()
    expect(state.data.value).toBeUndefined()
    expect(state.error.value).not.toBe('')
    await state.save('zip', true)
    expect(download).not.toHaveBeenCalled()
  },
)
it('does not query or download without read permission', async () => {
  const { state } = setup(false)
  await flushPromises()
  await state.load()
  await state.save('manifest', true)
  expect(revisionAssetsApi.list).not.toHaveBeenCalled()
  expect(download).not.toHaveBeenCalled()
})
it.each(['close', 'revoke', 'replace', 'unmount', 'cancel'])(
  'aborts pending binaries and prevents a late save on %s',
  async (action) => {
    const { state, revision, allowed } = setup()
    await flushPromises()
    let resolve!: (value: Awaited<ReturnType<typeof revisionAssetsApi.download>>) => void
    vi.mocked(revisionAssetsApi.download).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const saving = state.save('zip', true)
    const signal = vi.mocked(revisionAssetsApi.download).mock.calls[0]![4]!.signal as AbortSignal
    if (action === 'close') revision.value = undefined
    if (action === 'revoke') allowed.value = false
    if (action === 'replace') revision.value = { ...fixed, id: 'r2' }
    if (action === 'unmount') wrappers.pop()!.unmount()
    if (action === 'cancel') state.cancelDownload()
    expect(signal.aborted).toBe(true)
    resolve({ blob: new Blob(['late']), filename: 'late.zip', contentType: 'application/zip' })
    await saving
    expect(download).not.toHaveBeenCalled()
  },
)
it('denied export clears paths and data, while size and busy failures allow an explicit retry', async () => {
  const { state } = setup()
  await flushPromises()
  state.selectPage(true)
  vi.mocked(revisionAssetsApi.download).mockRejectedValueOnce(new ApiError('Too large', 413))
  await state.save('zip')
  expect(state.downloadError.value).not.toBe('')
  expect(state.selectedCount.value).toBe(1)
  vi.mocked(revisionAssetsApi.download).mockRejectedValueOnce(new ApiError('Busy', 429))
  await state.save('zip')
  expect(state.selectedCount.value).toBe(1)
  vi.mocked(revisionAssetsApi.download).mockRejectedValueOnce(new ApiError('Denied', 403))
  await state.save('zip')
  expect(state.data.value).toBeUndefined()
  expect(state.selectedCount.value).toBe(0)
  expect(state.downloadError.value).not.toBe('')
  expect(download).not.toHaveBeenCalled()
})
it('aborts superseded list requests and ignores a late response from the previous search', async () => {
  let resolve!: (value: RevisionAssetPage) => void
  vi.mocked(revisionAssetsApi.list).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const { state } = setup()
  const signal = vi.mocked(revisionAssetsApi.list).mock.calls[0]![3]!.signal as AbortSignal
  state.search.value = 'new'
  state.query()
  await flushPromises()
  expect(signal.aborted).toBe(true)
  resolve({ ...result(), revisionId: 'late' })
  await flushPromises()
  expect(state.data.value?.revisionId).toBe('r1')
})
