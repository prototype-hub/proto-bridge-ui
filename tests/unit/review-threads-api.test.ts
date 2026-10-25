import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  publicReviewThreadsApi,
  reviewThreadsApi,
} from '@/modules/protohub-manager-ui/api/review-thread'
import { request } from '@/shared/api/client'
vi.mock('@/shared/api/client', async (original) => ({
  ...(await original<object>()),
  request: { post: vi.fn(), put: vi.fn() },
}))
const page = { revisionId: 'r1', pageId: 'page', pageIndex: 0, pageSize: 20 },
  grant = { token: 'share/id', revisionId: 'r1', accessKey: 'access' }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(request.post).mockResolvedValue({ success: true, status: 200, result: {} })
  vi.mocked(request.put).mockResolvedValue({ success: true, status: 200, result: {} })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: {} }),
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())
it('uses only same-origin CSRF review endpoints and keeps author, body and credentials out of URLs', async () => {
  await publicReviewThreadsApi.query(grant, page, 'csrf')
  await publicReviewThreadsApi.create(
    grant,
    {
      revisionId: 'r1',
      pageId: 'page',
      text: '<script>plain</script>',
      clientRequestId: 'request',
    },
    'csrf',
  )
  await publicReviewThreadsApi.messages(grant, 'thread/id', page, 'csrf')
  await publicReviewThreadsApi.reply(
    grant,
    'thread/id',
    { revisionId: 'r1', pageId: 'page', text: 'Reply', clientRequestId: 'request-2' },
    'csrf',
  )
  await publicReviewThreadsApi.status(
    grant,
    'thread/id',
    {
      revisionId: 'r1',
      pageId: 'page',
      state: 'open',
      expectedVersion: 3,
      clientRequestId: 'request-3',
    },
    'csrf',
  )
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
    '/api/prototype-hub/public/shares/share%2Fid/review/threads/_query',
    '/api/prototype-hub/public/shares/share%2Fid/review/threads',
    '/api/prototype-hub/public/shares/share%2Fid/review/threads/thread%2Fid/messages/_query',
    '/api/prototype-hub/public/shares/share%2Fid/review/threads/thread%2Fid/messages',
    '/api/prototype-hub/public/shares/share%2Fid/review/threads/thread%2Fid/status',
  ])
  for (const [, options] of vi.mocked(fetch).mock.calls) {
    expect(options).toMatchObject({
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
    })
    expect(options!.headers).toMatchObject({ 'X-Review-CSRF': 'csrf' })
    expect(options!.headers).not.toHaveProperty('X-Access-Token')
    expect(JSON.parse(String(options!.body))).toMatchObject({
      revisionId: 'r1',
      pageId: 'page',
      accessKey: 'access',
    })
    expect(JSON.parse(String(options!.body))).not.toHaveProperty('guestId')
  }
  expect(vi.mocked(fetch).mock.calls[4]![1]!.method).toBe('PUT')
})
it('uses authenticated version scope, explicit visibility and status CAS for PM actions', async () => {
  const options = { silent: true },
    text = {
      revisionId: 'r1',
      pageId: 'page',
      text: 'Internal text',
      visibility: 'internal' as const,
      clientRequestId: 'request',
    }
  await reviewThreadsApi.query('version/id', page, options)
  await reviewThreadsApi.messages('version/id', 'thread/id', page, options)
  await reviewThreadsApi.reply('version/id', 'thread/id', text, options)
  await reviewThreadsApi.status(
    'version/id',
    'thread/id',
    {
      revisionId: 'r1',
      pageId: 'page',
      state: 'resolved',
      expectedVersion: 3,
      clientRequestId: 'state-key',
    },
    options,
  )
  expect(request.post).toHaveBeenNthCalledWith(
    1,
    '/prototype-hub/versions/version%2Fid/review-threads/_query',
    page,
    options,
  )
  expect(request.post).toHaveBeenNthCalledWith(
    2,
    '/prototype-hub/versions/version%2Fid/review-threads/thread%2Fid/messages/_query',
    page,
    options,
  )
  expect(request.post).toHaveBeenNthCalledWith(
    3,
    '/prototype-hub/versions/version%2Fid/review-threads/thread%2Fid/messages',
    text,
    options,
  )
  expect(request.put).toHaveBeenCalledWith(
    '/prototype-hub/versions/version%2Fid/review-threads/thread%2Fid/status',
    expect.objectContaining({
      state: 'resolved',
      expectedVersion: 3,
      clientRequestId: 'state-key',
    }),
    options,
  )
})
