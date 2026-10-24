import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { useRevisionComparison } from '@/modules/protohub-manager-ui/views/compare/hooks/useRevisionComparison'
import { versionsApi } from '@/modules/protohub-manager-ui/api'
import { copyText } from '@/shared/utils/feedback'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { ApiError } from '@/shared/api/errors'
import type { Revision, RevisionComparison } from '@/modules/protohub-manager-ui/types'
import { fixtureComparison, comparisonPages } from '../fixtures/comparison'
import { hookHarness } from '../fixtures/hook-harness'

vi.mock('@/modules/protohub-manager-ui/api', () => ({
  versionsApi: { compare: vi.fn(), revisionPages: vi.fn(), revisionPreviewSession: vi.fn() },
}))
vi.mock('@/shared/utils/feedback', () => ({ copyText: vi.fn().mockResolvedValue(true) }))
const wrappers: VueWrapper[] = []
function revision(id: string): Revision {
  return {
    id,
    projectId: 'p1',
    versionId: 'v1',
    versionName: id,
    entryFile: 'index.html',
    manifestSha256: 'a'.repeat(64),
    fileCount: 3,
    totalBytes: 30,
    createdBy: 'admin',
    createdAt: 1,
  }
}
function comparison(left = 'compare-left', right = 'compare-right') {
  return fixtureComparison(revision(left), revision(right), new URLSearchParams())
}
const initial = '/compare/p1/v1?leftRevisionId=compare-left&rightRevisionId=compare-right'
async function setup(url = initial) {
  let state!: ReturnType<typeof useRevisionComparison>
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/compare/:projectId/:versionId',
        component: hookHarness(() => {
          state = useRevisionComparison()
        }),
      },
    ],
  })
  await router.push(url)
  wrappers.push(mount(RouterView, { global: { plugins: [router, i18n] } }))
  await flushPromises()
  return { state, router }
}
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  vi.mocked(versionsApi.compare).mockImplementation(async (_id, query) =>
    fixtureComparison(
      revision(query.leftRevisionId),
      revision(query.rightRevisionId),
      new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)])),
    ),
  )
  vi.mocked(versionsApi.revisionPages).mockImplementation(async (_id, rid) => comparisonPages(rid))
  vi.mocked(versionsApi.revisionPreviewSession).mockImplementation(async (_id, rid) => ({
    runtimeBaseUrl: `/api/prototype-hub/runtime/v1/grant-${rid}`,
    previewUrl: `/api/prototype-hub/runtime/v1/grant-${rid}/index.html`,
    expiresAt: Date.now() + 300000,
  }))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.useRealTimers()
})

it('loads two exact snapshots, canonicalizes real page IDs and copies only comparison identities', async () => {
  const { state, router } = await setup(initial + '&token=secret&accessKey=secret#bad')
  expect(versionsApi.compare).toHaveBeenCalledWith(
    'v1',
    expect.objectContaining({
      leftRevisionId: 'compare-left',
      rightRevisionId: 'compare-right',
      includeUnchanged: false,
    }),
    expect.any(Object),
  )
  expect(state.contexts.value.left?.revisionId).toBe('compare-left')
  expect(state.contexts.value.right?.revisionId).toBe('compare-right')
  expect(router.currentRoute.value.query).toEqual({
    leftRevisionId: 'compare-left',
    rightRevisionId: 'compare-right',
    leftPageId: 'left-home',
    rightPageId: 'right-home',
  })
  expect(versionsApi.revisionPreviewSession).toHaveBeenCalledTimes(2)
  await state.copyLink()
  const copied = new URL(vi.mocked(copyText).mock.calls[0]![0])
  expect([...copied.searchParams.keys()]).toEqual([
    'leftRevisionId',
    'rightRevisionId',
    'leftPageId',
    'rightPageId',
  ])
  expect(copied.href).not.toMatch(/grant|secret|#bad/)
})
it.each([
  '?leftRevisionId=&rightRevisionId=compare-right',
  '?leftRevisionId=compare-left&leftRevisionId=other&rightRevisionId=compare-right',
  '?leftRevisionId=compare-left',
])('rejects malformed or missing pair %s without fallback or API requests', async (query) => {
  const { state } = await setup('/compare/p1/v1' + query)
  expect(state.error.value).toBe(protoLocales.zh.compareInvalidPair)
  expect(versionsApi.compare).not.toHaveBeenCalled()
  expect(versionsApi.revisionPreviewSession).not.toHaveBeenCalled()
})
it('keeps one-sided pages absent, legacy IDs null, and restores page choices with Back/Forward', async () => {
  const { state, router } = await setup()
  const removed = state.data.value!.pages.data.find((row) => row.status === 'removed')!
  state.selectPage(removed)
  await flushPromises()
  expect(state.contexts.value.left?.entryFile).toBe('old.html')
  expect(state.contexts.value.right).toBeUndefined()
  expect(router.currentRoute.value.query.rightPageId).toBeUndefined()
  router.back()
  await flushPromises()
  expect(state.contexts.value.right?.entryFile).toBe('index.html')
  router.forward()
  await flushPromises()
  expect(state.contexts.value.right).toBeUndefined()
  state.selectPage({
    path: 'legacy.html',
    status: 'unchanged',
    left: { path: 'legacy.html', name: 'Legacy', pageId: null },
    right: { path: 'legacy.html', name: 'Legacy', pageId: null },
  })
  await flushPromises()
  expect(state.selection.value.pages.left?.pageId).toBeNull()
  expect(state.contexts.value).toEqual({})
})
it.each(['leftPageId=unknown', 'leftPageId=left-home&leftPageId=left-only', 'rightPageId='])(
  'does not preview another page for invalid target %s',
  async (query) => {
    const { state } = await setup(initial + '&' + query)
    expect(state.pageError.value).toBe(protoLocales.zh.compareInvalidPage)
    expect(state.contexts.value).toEqual({})
  },
)
it('paginates each diff independently and resets both indices for unchanged filtering without renewing grants', async () => {
  const { state } = await setup()
  state.changePage('pages', 2, 10)
  await flushPromises()
  expect(versionsApi.compare).toHaveBeenLastCalledWith(
    'v1',
    expect.objectContaining({ pagesPageIndex: 1, pagesPageSize: 10, filesPageIndex: 0 }),
    expect.any(Object),
  )
  state.changePage('files', 3, 10)
  await flushPromises()
  expect(state.paging.pagesPageIndex).toBe(1)
  expect(state.paging.filesPageIndex).toBe(2)
  state.toggleUnchanged(true)
  await flushPromises()
  expect(state.data.value!.files.total).toBe(128)
  expect(state.paging.pagesPageIndex).toBe(0)
  expect(state.paging.filesPageIndex).toBe(0)
  expect(versionsApi.revisionPreviewSession).toHaveBeenCalledTimes(2)
})
it('rejects a response with another owner scope and clears displayed previews on a later access rejection', async () => {
  const { state } = await setup()
  vi.mocked(versionsApi.compare).mockRejectedValueOnce(new ApiError('Denied', 403))
  await state.load()
  expect(state.data.value).toBeUndefined()
  expect(state.contexts.value).toEqual({})
  expect(state.error.value).toBe('Denied')
  vi.mocked(versionsApi.compare).mockResolvedValueOnce({
    ...comparison(),
    left: { ...revision('compare-left'), projectId: 'another' },
  })
  await state.load()
  expect(state.error.value).toBe(protoLocales.zh.compareInvalidPair)
})
it('discards a late pair response after navigation and aborts its request', async () => {
  let resolve!: (result: RevisionComparison) => void
  vi.mocked(versionsApi.compare).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const { state, router } = await setup()
  const signal = vi.mocked(versionsApi.compare).mock.calls[0]![2]!.signal!
  await router.push(
    initial.replace('rightRevisionId=compare-right', 'rightRevisionId=compare-left'),
  )
  await flushPromises()
  resolve(comparison())
  await flushPromises()
  expect(signal.aborted).toBe(true)
  expect(state.data.value?.right.id).toBe('compare-left')
})
it('accepts the same explicit revision on both sides without substituting current', async () => {
  const { state } = await setup(
    initial.replace('rightRevisionId=compare-right', 'rightRevisionId=compare-left'),
  )
  expect(state.data.value?.summary.pages.changed).toBe(0)
  expect(state.data.value?.pages.total).toBe(0)
  expect(state.contexts.value.left?.revisionId).toBe('compare-left')
  expect(state.contexts.value.right?.revisionId).toBe('compare-left')
})
it('discards a late grant from the old pair while a rejected current grant affects only its pane', async () => {
  let resolve!: (value: { runtimeBaseUrl: string; previewUrl: string; expiresAt: number }) => void
  vi.mocked(versionsApi.revisionPreviewSession).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const { state, router } = await setup()
  const signal = vi.mocked(versionsApi.revisionPreviewSession).mock.calls[0]![2]!.signal!
  await router.push(
    initial.replace('rightRevisionId=compare-right', 'rightRevisionId=compare-left'),
  )
  await flushPromises()
  resolve({
    runtimeBaseUrl: '/api/prototype-hub/runtime/v1/stale-grant',
    previewUrl: '',
    expiresAt: Date.now() + 300000,
  })
  await flushPromises()
  expect(signal.aborted).toBe(true)
  expect(state.contexts.value.left?.runtimeBaseUrl).not.toContain('stale-grant')
  vi.mocked(versionsApi.revisionPreviewSession).mockRejectedValueOnce(new ApiError('Revoked', 403))
  await state.authorize('left')
  expect(state.panes.left.error).toBe('Revoked')
  expect(state.contexts.value.left).toBeUndefined()
  expect(state.contexts.value.right?.revisionId).toBe('compare-left')
})
it('expires one pane without renewing or disturbing the other, and reauthorizes only on explicit action', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.mocked(versionsApi.revisionPreviewSession).mockImplementation(async (_id, rid) => ({
    runtimeBaseUrl: `/api/prototype-hub/runtime/v1/${rid}`,
    previewUrl: '',
    expiresAt: Date.now() + (rid === 'compare-left' ? 1000 : 10000),
  }))
  const { state } = await setup()
  await vi.advanceTimersByTimeAsync(1001)
  expect(state.contexts.value.left).toBeUndefined()
  expect(state.contexts.value.right?.revisionId).toBe('compare-right')
  expect(state.panes.left.expired).toBe(true)
  expect(versionsApi.revisionPreviewSession).toHaveBeenCalledTimes(2)
  await state.authorize('left')
  expect(state.contexts.value.left?.revisionId).toBe('compare-left')
  expect(versionsApi.revisionPreviewSession).toHaveBeenCalledTimes(3)
})
