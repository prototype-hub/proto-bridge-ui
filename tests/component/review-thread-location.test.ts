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
  return { workspace, location, router, open, available }
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
