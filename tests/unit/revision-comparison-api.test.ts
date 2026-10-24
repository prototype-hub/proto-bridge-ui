import { expect, it, vi } from 'vitest'
import { versionsApi } from '@/modules/protohub-manager-ui/api/version'
import { request } from '@/shared/api/client'
vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn().mockResolvedValue({ result: { versionId: 'v' } }) },
}))
it('uses the fixed comparison contract and preserves cancellation without a current revision request', async () => {
  const signal = new AbortController().signal
  const query = {
    leftRevisionId: 'r/left',
    rightRevisionId: 'r/right',
    pagesPageIndex: 1,
    pagesPageSize: 10,
    filesPageIndex: 2,
    filesPageSize: 50,
    includeUnchanged: true,
  }
  expect(await versionsApi.compare('v/id', query, { signal, silent: true })).toEqual({
    versionId: 'v',
  })
  expect(request.get).toHaveBeenCalledExactlyOnceWith(
    '/prototype-hub/versions/v%2Fid/revisions/_compare',
    query,
    { signal, silent: true },
  )
})
