import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  publicReviewThreadsApi,
  reviewThreadsApi,
} from '@/modules/protohub-manager-ui/api/review-thread'
import { request } from '@/shared/api/client'
vi.mock('@/shared/api/client', async (original) => ({
  ...(await original<object>()),
  request: { post: vi.fn(), put: vi.fn(), postStream: vi.fn() },
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
const blobText = (value: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(value)
  })
it('keeps assignment detail, paged candidates and CAS clear on member-only encoded scope', async () => {
  const options = { signal: new AbortController().signal, silent: true }
  const target = { revisionId: 'r1', pageId: 'page' }
  await reviewThreadsApi.assignment('version/id', 'thread/id', target, options)
  await reviewThreadsApi.assignees(
    'version/id',
    'thread/id',
    { ...target, pageIndex: 2, pageSize: 20, keyword: '%_ name' },
    options,
  )
  const clear = { ...target, assigneeId: null, expectedVersion: 4, clientRequestId: 'key' }
  await reviewThreadsApi.assign('version/id', 'thread/id', clear, options)
  expect(request.post).toHaveBeenNthCalledWith(
    1,
    '/prototype-hub/versions/version%2Fid/review-threads/thread%2Fid/assignment/_detail',
    target,
    options,
  )
  expect(request.post).toHaveBeenNthCalledWith(
    2,
    '/prototype-hub/versions/version%2Fid/review-threads/thread%2Fid/assignment/_candidates',
    { ...target, pageIndex: 2, pageSize: 20, keyword: '%_ name' },
    options,
  )
  expect(request.put).toHaveBeenCalledWith(
    '/prototype-hub/versions/version%2Fid/review-threads/thread%2Fid/assignment',
    clear,
    options,
  )
  expect(fetch).not.toHaveBeenCalled()
  expect(publicReviewThreadsApi).not.toHaveProperty('assign')
})
it('sends precisely two multipart parts and only review credentials for a manual public image reply', async () => {
  const image = new File(['png'], 'private-filename.png', { type: 'image/png' })
  const data = { revisionId: 'r1', pageId: 'page', text: 'Caption', clientRequestId: 'key' }
  await publicReviewThreadsApi.replyImage(grant, 'thread/id', data, image, 'csrf')
  const [url, options] = vi.mocked(fetch).mock.calls[0]!
  expect(url).toBe(
    '/api/prototype-hub/public/shares/share%2Fid/review/threads/thread%2Fid/messages-with-image',
  )
  expect(options).toMatchObject({
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    method: 'POST',
  })
  expect(options!.headers).toMatchObject({ 'X-Review-CSRF': 'csrf' })
  expect(options!.headers).not.toHaveProperty('Content-Type')
  expect(options!.headers).not.toHaveProperty('X-Access-Token')
  const form = options!.body as FormData
  expect([...form.keys()]).toEqual(['request', 'image'])
  expect((form.get('request') as File).type).toBe('application/json')
  expect(JSON.parse(await blobText(form.get('request') as Blob))).toEqual({
    ...data,
    accessKey: 'access',
  })
  expect((form.get('image') as File).name).toBe('image')
  expect(await blobText(form.get('image') as Blob)).toBe('png')
})
it('uses member auth multipart and protected POST binary paths without adding public access credentials', async () => {
  const image = new File(['jpeg'], 'private.jpg', { type: 'image/jpeg' })
  const data = {
    revisionId: 'r1',
    pageId: 'page',
    text: 'PM caption',
    clientRequestId: 'key',
    visibility: 'internal' as const,
  }
  const options = { silent: true }
  await reviewThreadsApi.replyImage('version/id', 'thread/id', data, image, options)
  const [url, form, actualOptions] = vi.mocked(request.post).mock.calls[0]!
  expect(url).toBe(
    '/prototype-hub/versions/version%2Fid/review-threads/thread%2Fid/messages-with-image',
  )
  expect(actualOptions).toBe(options)
  expect(JSON.parse(await blobText((form as FormData).get('request') as Blob))).toEqual(data)
  const blob = new Blob(['jpeg'], { type: 'image/jpeg' })
  vi.mocked(request.postStream).mockResolvedValue({
    blob,
    contentType: 'image/jpeg',
    filename: 'image.jpg',
  })
  expect(await reviewThreadsApi.image('version/id', 'thread/id', 'message/id', page, options)).toBe(
    blob,
  )
  expect(request.postStream).toHaveBeenCalledWith(
    '/prototype-hub/versions/version%2Fid/review-threads/thread%2Fid/messages/message%2Fid/image',
    page,
    options,
  )
})
it('fetches a public image as no-store CSRF POST and rejects non-image binary success or error envelopes', async () => {
  const blob = new Blob(['png'], { type: 'image/png' })
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'image/png' }),
    blob: async () => blob,
  } as Response)
  expect(await publicReviewThreadsApi.image(grant, 'thread/id', 'message/id', page, 'csrf')).toBe(
    blob,
  )
  const [url, options] = vi.mocked(fetch).mock.calls[0]!
  expect(url).toBe(
    '/api/prototype-hub/public/shares/share%2Fid/review/threads/thread%2Fid/messages/message%2Fid/image',
  )
  expect(options).toMatchObject({
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
  })
  expect(JSON.parse(options!.body as string)).toEqual({ ...page, accessKey: 'access' })
  expect(options!.headers).not.toHaveProperty('X-Access-Token')
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    headers: new Headers({ 'Content-Type': 'image/svg+xml' }),
  } as Response)
  await expect(publicReviewThreadsApi.image(grant, 't', 'm', page, 'csrf')).rejects.toThrow()
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status: 404,
    json: async () => ({
      success: false,
      status: 404,
      code: 'PROTOTYPE_HUB_REVIEW_IMAGE_UNAVAILABLE',
    }),
  } as Response)
  await expect(publicReviewThreadsApi.image(grant, 't', 'm', page, 'csrf')).rejects.toMatchObject({
    status: 404,
    code: 'PROTOTYPE_HUB_REVIEW_IMAGE_UNAVAILABLE',
  })
})
it('looks up a known scoped detail with the same anonymous CSRF or member transport, never a query grant', async () => {
  const target = { revisionId: 'r1', pageId: 'page' }
  const signal = new AbortController().signal
  await publicReviewThreadsApi.detail(grant, 'thread/id', target, 'csrf', signal)
  expect(vi.mocked(fetch).mock.calls[0]).toEqual([
    '/api/prototype-hub/public/shares/share%2Fid/review/threads/thread%2Fid/_detail',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      headers: expect.objectContaining({ 'X-Review-CSRF': 'csrf' }),
      body: JSON.stringify({ revisionId: 'r1', accessKey: 'access', pageId: 'page' }),
    }),
  ])
  expect(vi.mocked(fetch).mock.calls[0]![1]!.headers).not.toHaveProperty('X-Access-Token')
  await reviewThreadsApi.detail('version/id', 'thread/id', target, { signal, silent: true })
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/versions/version%2Fid/review-threads/thread%2Fid/_detail',
    target,
    { signal, silent: true },
  )
})
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
