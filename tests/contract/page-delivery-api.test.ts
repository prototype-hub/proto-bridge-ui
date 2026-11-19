import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/shared/api/client'
import { pageDeliveriesApi } from '@/modules/protohub-manager-ui/api/page-delivery'
vi.mock('@/shared/api/client', () => ({ request: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
beforeEach(() => {
  vi.resetAllMocks()
  for (const method of ['get', 'post', 'put'] as const)
    vi.mocked(request[method]).mockResolvedValue({ success: true, status: 200, result: {} })
})
it('encodes IDs and sends revision, bounded paging and retry identity without changing the payload', async () => {
  const options = { silent: true, signal: new AbortController().signal }
  await pageDeliveriesApi.get('v /', 'p?', 'fixed-old', options)
  expect(request.get).toHaveBeenCalledWith(
    '/prototype-hub/versions/v%20%2F/page-deliveries/p%3F',
    { revisionId: 'fixed-old' },
    options,
  )
  const input = {
    revisionId: 'fixed-old',
    state: 'READY' as const,
    assigneeId: null,
    reason: '',
    expectedVersion: 0,
    clientRequestId: 'exact-key',
  }
  await pageDeliveriesApi.save('v /', 'p?', input, options)
  expect(request.put).toHaveBeenCalledWith(
    '/prototype-hub/versions/v%20%2F/page-deliveries/p%3F',
    input,
    options,
  )
  await pageDeliveriesApi.query(
    'v1',
    { revisionId: 'fixed-old', state: 'DONE', pageIndex: 2, pageSize: 20 },
    options,
  )
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/versions/v1/page-deliveries/_query',
    { revisionId: 'fixed-old', state: 'DONE', pageIndex: 2, pageSize: 20 },
    options,
  )
  await pageDeliveriesApi.candidates(
    'v1',
    { revisionId: 'fixed-old', keyword: 'Viewer', pageIndex: 1, pageSize: 20 },
    options,
  )
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/versions/v1/page-deliveries/_candidates',
    { revisionId: 'fixed-old', keyword: 'Viewer', pageIndex: 1, pageSize: 20 },
    options,
  )
})
