import { expect, it, vi } from 'vitest'
import { revisionAssetsApi } from '@/modules/protohub-manager-ui/api/revision-asset'
import { request } from '@/shared/api/client'
vi.mock('@/shared/api/client', () => ({
  request: {
    get: vi.fn().mockResolvedValue({ result: {} }),
    postStream: vi.fn().mockResolvedValue({}),
  },
}))
it('encodes fixed revision segments and preserves the binary selection and cancellation', async () => {
  const signal = new AbortController().signal
  const selection = { expectedManifestSha256: 'a'.repeat(64), all: false, paths: ['images/图.svg'] }
  await revisionAssetsApi.list(
    'v/id',
    'r/id',
    { pageIndex: 1, pageSize: 50, search: '%' },
    { signal, silent: true },
  )
  expect(request.get).toHaveBeenCalledExactlyOnceWith(
    '/prototype-hub/versions/v%2Fid/revisions/r%2Fid/assets',
    { pageIndex: 1, pageSize: 50, search: '%' },
    { signal, silent: true },
  )
  for (const format of ['file', 'zip', 'manifest'] as const) {
    await revisionAssetsApi.download('v/id', 'r/id', format, selection, { signal })
    expect(request.postStream).toHaveBeenLastCalledWith(
      `/prototype-hub/versions/v%2Fid/revisions/r%2Fid/assets/_${format}`,
      selection,
      { signal },
    )
  }
})
