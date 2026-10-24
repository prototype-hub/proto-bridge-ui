import { beforeEach, expect, it, vi } from 'vitest'
import { reviewGuestsApi } from '@/modules/protohub-manager-ui/api/review-guest'
import { request } from '@/shared/api/client'
vi.mock('@/shared/api/client', () => ({ request: { post: vi.fn(), put: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(request.post).mockResolvedValue({
    result: { data: [], total: 0, pageIndex: 0, pageSize: 20 },
    success: true,
    status: 200,
  })
  vi.mocked(request.put).mockResolvedValue({ result: {}, success: true, status: 200 })
})
it('encodes project and guest identifiers and sends only bounded-page fields or explicit CAS state', async () => {
  const signal = new AbortController().signal
  const options = { signal, silent: true }
  expect(await reviewGuestsApi.query('p/id', { pageIndex: 2, pageSize: 20 }, options)).toEqual({
    data: [],
    total: 0,
    pageIndex: 0,
    pageSize: 20,
  })
  await reviewGuestsApi.setEnabled('p/id', 'g/id', false, 7, options)
  expect(request.post).toHaveBeenCalledExactlyOnceWith(
    '/prototype-hub/projects/p%2Fid/review-guests/_query',
    { pageIndex: 2, pageSize: 20 },
    options,
  )
  expect(request.put).toHaveBeenCalledExactlyOnceWith(
    '/prototype-hub/projects/p%2Fid/review-guests/g%2Fid/enabled',
    { enabled: false, expectedVersion: 7 },
    options,
  )
})
