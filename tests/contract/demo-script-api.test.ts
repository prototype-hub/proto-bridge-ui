import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/shared/api/client'
import { publicRequest } from '@/shared/api/public-client'
import { demoScriptApi as api } from '@/modules/protohub-manager-ui/api/demo-script'
vi.mock('@/shared/api/client', () => ({ request: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { post: vi.fn() } }))
beforeEach(() => {
  vi.resetAllMocks()
  for (const method of ['get', 'post', 'put'] as const)
    vi.mocked(request[method]).mockResolvedValue({ success: true, status: 200, result: {} })
  vi.mocked(publicRequest.post).mockResolvedValue({ success: true, status: 200, result: {} })
})
it('uses nested immutable internal endpoints and passes the exact original mutation object', async () => {
  const options = { silent: true, signal: new AbortController().signal }
  await api.query('v /', 'r?', 2, options)
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/versions/v%20%2F/revisions/r%3F/demo-scripts/_query',
    { pageIndex: 2, pageSize: 20 },
    options,
  )
  await api.get('v1', 'r1', 'id /', options)
  expect(request.get).toHaveBeenCalledWith(
    '/prototype-hub/versions/v1/revisions/r1/demo-scripts/id%20%2F',
    undefined,
    options,
  )
  const input = {
    title: 'Script',
    objective: 'Goal',
    prerequisites: '',
    resetNote: '',
    shareEnabled: false,
    steps: [{ id: 'step1', pageId: 'home', narration: 'text' }],
    clientRequestId: 'original',
    expectedVersion: 3,
  }
  await api.update('v1', 'r1', 's1', input, options)
  expect(vi.mocked(request.put).mock.calls[0][1]).toBe(input)
  const deletion = { clientRequestId: 'delete-original', expectedVersion: 3 }
  await api.remove('v1', 'r1', 's1', deletion, options)
  expect(request.post).toHaveBeenLastCalledWith(
    '/prototype-hub/versions/v1/revisions/r1/demo-scripts/s1/_delete',
    deletion,
    options,
  )
})
it('uses only the anonymous client with freshly resolved exact grant fields for fixed and latest shares', async () => {
  for (const revisionMode of ['fixed', 'latest'] as const) {
    const share = {
      token: 't /',
      accessKey: 'exact-grant',
      revisionId: 'resolved-old',
      revisionMode,
      projectName: 'P',
      versionName: 'V',
      passwordRequired: true,
    }
    await api.publicQuery(share, 0)
    expect(publicRequest.post).toHaveBeenLastCalledWith(
      '/prototype-hub/public/shares/t%20%2F/demo-scripts/_query',
      { revisionId: 'resolved-old', accessKey: 'exact-grant', pageIndex: 0, pageSize: 20 },
      undefined,
    )
    await api.publicGet(share, 'script?')
    expect(publicRequest.post).toHaveBeenLastCalledWith(
      '/prototype-hub/public/shares/t%20%2F/demo-scripts/script%3F/context',
      { revisionId: 'resolved-old', accessKey: 'exact-grant' },
      undefined,
    )
  }
  expect(request.get).not.toHaveBeenCalled()
  expect(request.post).not.toHaveBeenCalled()
  expect(request.put).not.toHaveBeenCalled()
})
