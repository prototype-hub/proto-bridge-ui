import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, reactive, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { usePublicShare } from '@/modules/protohub-manager-ui/views/share/hooks/usePublicShare'
import { publicApi } from '@/modules/protohub-manager-ui/api'
import type { PublicShare } from '@/modules/protohub-manager-ui/types'
const { route } = vi.hoisted(() => ({
  route: { params: { token: 'first' }, path: '/share/first', query: {} as Record<string, unknown> },
}))
vi.mock('vue-router', () => ({ useRoute: () => reactive(route) }))
vi.mock('@/modules/protohub-manager-ui/api', () => ({
  publicApi: { get: vi.fn(), verify: vi.fn(), pages: vi.fn() },
}))
let scope: EffectScope
const locked = (token: string): PublicShare => ({
  token,
  revisionId: 'r1',
  revisionMode: 'fixed',
  projectName: token,
  versionName: 'Version',
  passwordRequired: true,
})
const authorized = (token: string): PublicShare => {
  const base = `/api/prototype-hub/public/shares/${token}/key/revisions/r1`
  return {
    ...locked(token),
    accessKey: 'key',
    pagesUrl: `${base}/pages`,
    runtimeBaseUrl: `${base}/runtime`,
    previewUrl: `${base}/runtime/index.html`,
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  route.params.token = 'first'
  route.query = {}
  scope = effectScope()
  vi.mocked(publicApi.get).mockImplementation(async (token) => locked(token))
  vi.mocked(publicApi.pages).mockResolvedValue([])
})
afterEach(() => scope.stop())
it.each(['resolve', 'reject'] as const)(
  'discards a late password %s after navigating to another public share',
  async (outcome) => {
    let resolve!: (value: PublicShare) => void
    let reject!: (cause: Error) => void
    vi.mocked(publicApi.verify).mockReturnValueOnce(
      new Promise((done, fail) => {
        resolve = done
        reject = fail
      }),
    )
    const state = scope.run(usePublicShare)!
    await flushPromises()
    state.password.value = 'secret'
    const pending = state.verify()
    reactive(route).params.token = 'second'
    await flushPromises()
    if (outcome === 'resolve') resolve(authorized('first'))
    else reject(new Error('old failure'))
    await pending
    expect(state.resource.data.value.share?.token).toBe('second')
    expect(state.resource.data.value.context).toBeUndefined()
    expect(state.password.value).toBe('')
    expect(state.task.error.value).toBe('')
  },
)
it('loads server-granted snapshot pages and drops old content before a retry is rejected', async () => {
  vi.mocked(publicApi.get).mockResolvedValueOnce(authorized('first'))
  const state = scope.run(usePublicShare)!
  await flushPromises()
  expect(publicApi.pages).toHaveBeenCalledWith(
    authorized('first'),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
  expect(state.resource.data.value.context?.entryFile).toBe('index.html')
  reactive(route).params.token = 'revoked'
  vi.mocked(publicApi.get).mockRejectedValueOnce(new Error('Share unavailable'))
  await flushPromises()
  expect(state.resource.data.value.context).toBeUndefined()
  expect(state.resource.error.value).toBe('Share unavailable')
})

it.each(['fixed', 'latest'] as const)(
  'rejects a deep-link revision outside fresh %s share policy without loading pages',
  async (revisionMode) => {
    route.query = { revisionId: 'old-rid', pageId: 'home' }
    vi.mocked(publicApi.get).mockResolvedValueOnce({ ...authorized('first'), revisionMode })
    const state = scope.run(usePublicShare)!
    await flushPromises()
    expect(state.resource.data.value.context).toBeUndefined()
    expect(state.resource.error.value).toBeTruthy()
    expect(publicApi.pages).not.toHaveBeenCalled()
  },
)
it('checks password verification against the requested revision and clears stale content before a policy denial', async () => {
  route.query = { revisionId: 'r1', pageId: 'home' }
  const state = scope.run(usePublicShare)!
  await flushPromises()
  state.password.value = 'secret'
  vi.mocked(publicApi.verify).mockResolvedValueOnce({ ...authorized('first'), revisionId: 'r2' })
  await state.verify()
  expect(state.resource.data.value.context).toBeUndefined()
  expect(state.task.error.value).toBeTruthy()
  expect(publicApi.pages).not.toHaveBeenCalled()
})
it('does not refetch for canonical revision or page navigation but refreshes policy for another revision', async () => {
  vi.mocked(publicApi.get).mockResolvedValueOnce(authorized('first'))
  const state = scope.run(usePublicShare)!
  await flushPromises()
  reactive(route).query = { revisionId: 'r1', pageId: 'home' }
  await flushPromises()
  reactive(route).query = { revisionId: 'r1', pageId: 'detail' }
  await flushPromises()
  expect(publicApi.get).toHaveBeenCalledOnce()
  expect(publicApi.pages).toHaveBeenCalledOnce()
  reactive(route).query = { revisionId: 'old-rid', pageId: 'detail' }
  await flushPromises()
  expect(publicApi.get).toHaveBeenCalledTimes(2)
  expect(state.resource.data.value.context).toBeUndefined()
  expect(state.resource.error.value).toBeTruthy()
})
