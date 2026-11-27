import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/shared/api/client'
import { publicRequest } from '@/shared/api/public-client'
import { revisionApprovalApi as api } from '@/modules/protohub-manager-ui/api/revision-approval'
vi.mock('@/shared/api/client', () => ({ request: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { post: vi.fn() } }))
beforeEach(() => {
  vi.resetAllMocks()
  for (const fn of [request.get, request.post, publicRequest.post])
    vi.mocked(fn).mockResolvedValue({ success: true, status: 200, result: {} })
})
it('encodes exact scope, preserves original payload and uses anonymous public boundary', async () => {
  const options = { silent: true, signal: new AbortController().signal },
    body = { action: 'approve' as const, expectedVersion: 0, clientRequestId: 'same', note: 'note' }
  await api.get('v /', 'r?', options)
  expect(request.get).toHaveBeenCalledWith(
    '/prototype-hub/versions/v%20%2F/revisions/r%3F/approval',
    undefined,
    options,
  )
  await api.act('v1', 'old', body, options)
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/versions/v1/revisions/old/approval/_act',
    body,
    options,
  )
  await api.history('v1', 'old', { pageIndex: 2, pageSize: 10 }, options)
  expect(request.post).toHaveBeenLastCalledWith(
    '/prototype-hub/versions/v1/revisions/old/approval/_history',
    { pageIndex: 2, pageSize: 10 },
    options,
  )
  await api.publicContext('t /', { revisionId: 'old', accessKey: 'grant' }, options)
  expect(publicRequest.post).toHaveBeenCalledWith(
    '/prototype-hub/public/shares/t%20%2F/approval/context',
    { revisionId: 'old', accessKey: 'grant' },
    options,
  )
})
