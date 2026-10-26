import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { useWorkspaceLocation } from '@/modules/protohub-manager-ui/hooks/useWorkspaceLocation'
import { useReviewThreadLocation } from '@/modules/protohub-manager-ui/hooks/useReviewThreadLocation'
import type {
  ReviewPage,
  ReviewThread,
  WorkspaceContext,
} from '@/modules/protohub-manager-ui/types'
import { copyText } from '@/shared/utils/feedback'
import { hookHarness } from '../fixtures/hook-harness'
vi.mock('@/shared/utils/feedback', () => ({ copyText: vi.fn().mockResolvedValue(true) }))
const id = 'a'.repeat(43)
const wrappers: VueWrapper[] = []
const originalUrl = window.location.href
function thread(pageId = 'home'): ReviewThread {
  return {
    id,
    revisionId: 'r1',
    pageId,
    pageName: 'Page',
    pagePath: 'index.html',
    summary: 'Text',
    authorName: 'Visitor',
    authorCompany: null,
    verificationLevel: 'email',
    state: 'open',
    configVersion: 0,
    createdAt: 1,
    updatedAt: 1,
  }
}
async function setup(path: string, base = '/tools/', ready = true) {
  const open = ref(false),
    available = ref(ready)
  const data = ref<WorkspaceContext>({
    revisionId: 'r1',
    locationPath: path.split('?')[0],
    title: 'Project',
    versionName: 'V1',
    runtimeBaseUrl: '/api/prototype-hub/runtime/v1/grant',
    entryFile: 'index.html',
    pages: [
      { name: 'Home', pageId: 'home', path: 'index.html' },
      { name: 'Details', pageId: 'detail', path: 'detail.html' },
    ],
  })
  let workspace!: ReturnType<typeof useWorkspaceLocation>
  let location!: ReturnType<typeof useReviewThreadLocation>
  const harness = hookHarness(() => {
    workspace = useWorkspaceLocation(data)
    const page = computed<ReviewPage | undefined>(() =>
      workspace.pageId.value && workspace.selectedPage.value?.path
        ? {
            revisionId: data.value.revisionId!,
            pageId: workspace.pageId.value,
            name: workspace.selectedPage.value.name,
            path: workspace.selectedPage.value.path,
          }
        : undefined,
    )
    location = useReviewThreadLocation(page, open, available)
  })
  const router = createRouter({
    history: createMemoryHistory(base),
    routes: [
      { path: '/preview/:projectId/:versionId', component: harness },
      { path: '/share/:token', component: harness },
    ],
  })
  await router.push(path)
  const wrapper = mount(RouterView, { global: { plugins: [router] } })
  wrappers.push(wrapper)
  await flushPromises()
  return { workspace, location, router, open, available, data }
}
beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/tools/?unrelated=secret#old')
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  window.history.replaceState({}, '', originalUrl)
})

it('waits for the authorized shell, preserves the target through an identity handoff and only clears it on explicit close', async () => {
  const { location, router, open, available } = await setup(
    `/share/open?revisionId=r1&pageId=home&threadId=${id}`,
    '/tools/',
    false,
  )
  expect(location.threadId.value).toBe(id)
  expect(open.value).toBe(false)
  expect(location.unavailable.value).toBe(true)
  available.value = true
  await flushPromises()
  expect(open.value).toBe(true)
  expect(location.unavailable.value).toBe(false)
  open.value = false
  await router.replace({ query: { ...router.currentRoute.value.query, unrelated: 'ignored' } })
  await flushPromises()
  expect(open.value).toBe(false)
  expect(location.threadId.value).toBe(id)
  location.close()
  await flushPromises()
  expect(router.currentRoute.value.query).toMatchObject({ revisionId: 'r1', pageId: 'home' })
  expect(router.currentRoute.value.query.threadId).toBeUndefined()
})

it('clears the target on explicit page selection and restores it through Back/Forward without inventing another page', async () => {
  const { workspace, location, router, open } = await setup(
    `/preview/p1/v1?revisionId=r1&pageId=home&threadId=${id}`,
  )
  expect(open.value).toBe(true)
  workspace.select('detail.html', 'detail')
  await flushPromises()
  expect(location.threadId.value).toBeUndefined()
  expect(workspace.pageId.value).toBe('detail')
  router.back()
  await flushPromises()
  expect(location.threadId.value).toBe(id)
  expect(workspace.pageId.value).toBe('home')
  router.forward()
  await flushPromises()
  expect(location.threadId.value).toBeUndefined()
  expect(workspace.pageId.value).toBe('detail')
  location.select(thread('detail'))
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({
    revisionId: 'r1',
    pageId: 'detail',
    threadId: id,
  })
})

it.each([
  `threadId=${id}`,
  `revisionId=r1&threadId=${id}`,
  `pageId=home&threadId=${id}`,
  `revisionId=r1&pageId=home&threadId=${id}&threadId=${id}`,
  `revisionId=r1&revisionId=r1&pageId=home&threadId=${id}`,
  `revisionId=r1&pageId=home&pageId=detail&threadId=${id}`,
  'revisionId=r1&pageId=home&threadId=',
])(
  'does not repair an invalid thread triple during workspace canonicalization (%s)',
  async (query) => {
    const { location, router, open } = await setup(`/share/open?${query}`)
    expect(location.invalid.value).toBe(true)
    expect(location.threadId.value).toBeNull()
    expect(open.value).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe(`/share/open?${query}`)
  },
)

it('views a manifest-backed overview target across pages with only three IDs and restores Back/Forward', async () => {
  const { location, router, workspace, data, open } = await setup(
    `/share/open?revisionId=r1&pageId=home&threadId=${id}`,
  )
  expect(await location.view({ ...thread('detail'), id: 'b'.repeat(43) }, data.value)).toBe(true)
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({
    revisionId: 'r1',
    pageId: 'detail',
    threadId: 'b'.repeat(43),
  })
  expect(workspace.pageId.value).toBe('detail')
  expect(open.value).toBe(true)
  router.back()
  await flushPromises()
  expect(workspace.pageId.value).toBe('home')
  expect(location.threadId.value).toBe(id)
  router.forward()
  await flushPromises()
  expect(location.threadId.value).toBe('b'.repeat(43))
})

it.each([
  'invalid-id',
  'foreign-revision',
  'missing-page',
  'duplicate-page',
  'folder',
  'unsafe-path',
  'no-access',
] as const)('rejects an overview %s target without touching the current route', async (kind) => {
  const { location, router, data, available } = await setup(
    `/share/open?revisionId=r1&pageId=home&threadId=${id}`,
  )
  const target = thread('detail')
  if (kind === 'invalid-id') target.id = 'not-a-real-id'
  if (kind === 'foreign-revision') target.revisionId = 'foreign'
  if (kind === 'missing-page') target.pageId = 'missing'
  if (kind === 'duplicate-page') data.value.pages.push({ ...data.value.pages[1]! })
  if (kind === 'folder') data.value.pages[1]!.folder = true
  if (kind === 'unsafe-path') data.value.pages[1]!.path = '../escape.html'
  if (kind === 'no-access') available.value = false
  const before = router.currentRoute.value.fullPath
  expect(await location.view(target, data.value)).toBe(false)
  expect(router.currentRoute.value.fullPath).toBe(before)
})

it('returns to the same overview target without pushing navigation or disturbing a draft owner', async () => {
  const { location, router, data, open } = await setup(
    `/share/open?revisionId=r1&pageId=home&threadId=${id}`,
  )
  open.value = false
  const push = vi.spyOn(router, 'push')
  expect(await location.view(thread(), data.value)).toBe(true)
  expect(push).not.toHaveBeenCalled()
  expect(open.value).toBe(true)
})

it('does not reopen a cancelled overview navigation or one completed after access is lost', async () => {
  const { location, router, data, open, available } = await setup(
    `/share/open?revisionId=r1&pageId=home&threadId=${id}`,
  )
  open.value = false
  const before = router.currentRoute.value.fullPath
  const removeGuard = router.beforeEach(() => false)
  expect(await location.view(thread('detail'), data.value)).toBe(false)
  expect(router.currentRoute.value.fullPath).toBe(before)
  expect(open.value).toBe(false)
  removeGuard()
  let finish!: () => void
  router.beforeEach(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const navigation = location.view(thread('detail'), data.value)
  await flushPromises()
  available.value = false
  finish()
  expect(await navigation).toBe(false)
  expect(open.value).toBe(false)
})

it.each([
  ['/preview/p1/v1', '/tools/'],
  ['/share/open', '/tools/'],
  ['/share/open', '/tools/#'],
])(
  'copies only the current shell and target IDs with router base/hash support: %s %s',
  async (path, base) => {
    const { workspace, location } = await setup(
      `${path}?revisionId=r1&pageId=home&threadId=${id}&accessKey=secret&password=secret&csrf=secret#reviewInvitation=secret`,
      base,
    )
    await location.copy(thread())
    const link = vi.mocked(copyText).mock.calls[0]![0]
    const prefix = base.endsWith('#') ? `${base}/` : base
    expect(link).toBe(
      `${window.location.origin}${prefix}${path.slice(1)}?revisionId=r1&pageId=home&threadId=${id}`,
    )
    expect(link).not.toMatch(/secret|accessKey|password|csrf|reviewInvitation|runtime/)
    await workspace.copyCurrentPage()
    expect(vi.mocked(copyText).mock.calls[1]![0]).toBe(
      `${window.location.origin}${prefix}${path.slice(1)}?revisionId=r1&pageId=home`,
    )
    const calls = vi.mocked(copyText).mock.calls.length
    await location.copy({ ...thread(), pageId: 'foreign' })
    expect(copyText).toHaveBeenCalledTimes(calls)
  },
)
