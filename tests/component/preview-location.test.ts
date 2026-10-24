import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { copyText } from '@/shared/utils/feedback'
import PrototypeWorkspace from '@/modules/protohub-manager-ui/components/PrototypeWorkspace.vue'
import { useWorkspaceLocation } from '@/modules/protohub-manager-ui/hooks/useWorkspaceLocation'
import type { WorkspaceContext } from '@/modules/protohub-manager-ui/types'
import { hookHarness } from '../fixtures/hook-harness'
vi.mock('@/shared/utils/feedback', () => ({ copyText: vi.fn().mockResolvedValue(true) }))
const wrappers: VueWrapper[] = []
const context = (): WorkspaceContext => ({
  revisionId: 'r1',
  locationPath: '/preview/p1/v1',
  title: 'Project',
  versionName: 'V1',
  runtimeBaseUrl: '/api/prototype-hub/runtime/v1/private-runtime-grant',
  entryFile: 'index.html',
  pages: [
    {
      name: 'Folder',
      folder: true,
      children: [
        { name: 'Home', pageId: 'home', path: 'index.html' },
        { name: 'Details', pageId: 'detail', path: 'nested/details.html' },
        { name: 'Alias', pageId: 'alias', path: 'nested/details.html' },
        { name: 'Legacy', path: 'legacy.html' },
      ],
    },
  ],
})
async function setup(
  path = '/preview/p1/v1',
  ui = false,
  initial = context(),
  canonicalGuard?: () => Promise<void>,
) {
  const data = ref(initial)
  let state!: ReturnType<typeof useWorkspaceLocation>
  const harness = hookHarness(() => {
    state = useWorkspaceLocation(data)
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/preview/:projectId/:versionId',
        component: ui ? { render: () => h(PrototypeWorkspace, { context: data.value }) } : harness,
      },
      { path: '/share/:token', component: harness },
    ],
  })
  await router.push(path)
  if (canonicalGuard)
    router.beforeEach((to) => (to.query.pageId === 'home' ? canonicalGuard() : undefined))
  const wrapper = mount(RouterView, { global: { plugins: [router, i18n] } })
  wrappers.push(wrapper)
  await flushPromises()
  return { state, router, wrapper, data }
}
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})
it('replaces the legacy entry, pushes exact IDs for alias paths and restores Back/Forward', async () => {
  const { state, router } = await setup()
  expect(router.currentRoute.value.query).toEqual({ revisionId: 'r1', pageId: 'home' })
  state.select('nested/details.html', 'detail')
  await flushPromises()
  expect(router.currentRoute.value.query.pageId).toBe('detail')
  state.select('nested/details.html', 'alias')
  await flushPromises()
  expect(state.selectedPage.value?.name).toBe('Alias')
  router.back()
  await flushPromises()
  expect(state.selectedPage.value?.pageId).toBe('detail')
  router.forward()
  await flushPromises()
  expect(state.selectedPage.value?.pageId).toBe('alias')
})
it('copies a reconstructed app URL containing only authorized revision/page identity', async () => {
  const { state } = await setup(
    '/preview/p1/v1?revisionId=r1&pageId=detail&token=platform-secret&password=secret&accessKey=runtime-secret#bad',
  )
  await state.copyCurrentPage()
  const value = vi.mocked(copyText).mock.calls[0][0]
  const link = new URL(value)
  expect(link.pathname).toBe('/preview/p1/v1')
  expect([...link.searchParams]).toEqual([
    ['revisionId', 'r1'],
    ['pageId', 'detail'],
  ])
  expect(link.hash).toBe('')
  expect(value).not.toMatch(/secret|grant|runtime|bad/)
})
it('uses the original public share token with no access grant in its copied URL', async () => {
  const { state } = await setup('/share/original-token?revisionId=r1&pageId=detail', false, {
    ...context(),
    locationPath: '/share/original-token',
  })
  await state.copyCurrentPage()
  expect(new URL(vi.mocked(copyText).mock.calls[0][0]).pathname).toBe('/share/original-token')
})
it('keeps a legacy page usable but disables stable copying and never changes a newer route', async () => {
  const { state, router } = await setup('/preview/p1/v1?revisionId=r1&pageId=detail')
  state.select('legacy.html')
  await flushPromises()
  expect(state.currentPage.value).toBe('legacy.html')
  expect(state.canCopy.value).toBe(false)
  expect(router.currentRoute.value.query.pageId).toBeUndefined()
  await router.push('/preview/p2/v2')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/preview/p2/v2')
  expect(state.error.value).toBe(protoLocales.zh.invalidPageTarget)
})
it.each(['missing', '', ['home', 'detail']])(
  'unmounts the runtime on invalid page target %j',
  async (target) => {
    const { wrapper, router } = await setup('/preview/p1/v1?revisionId=r1&pageId=detail', true)
    expect(wrapper.find('iframe').attributes('src')).toMatch(/nested\/details.html$/)
    await router.push({ query: { revisionId: 'r1', pageId: target } })
    await flushPromises()
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.text()).toContain(protoLocales.zh.invalidPageTarget)
  },
)
it('shows the current name/path and copies only a stable available page', async () => {
  const { wrapper } = await setup('/preview/p1/v1?revisionId=r1&pageId=detail', true)
  expect(wrapper.get('.workspace-current').text()).toContain('Details')
  expect(wrapper.get('.current-path').text()).toBe('nested/details.html')
  await wrapper.get('.workspace-current button').trigger('click')
  expect(copyText).toHaveBeenCalledOnce()
  expect(wrapper.get('iframe').attributes('sandbox')).toBe('allow-scripts allow-forms')
  expect(wrapper.get('iframe').attributes('referrerpolicy')).toBe('no-referrer')
})

it('never lets a delayed canonical replacement overwrite a newer route', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const { router, state } = await setup('/preview/p1/v1', false, context(), () => gate)
  await router.push('/preview/p2/v2?revisionId=r2&pageId=new-page')
  release()
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/preview/p2/v2?revisionId=r2&pageId=new-page')
  expect(state.currentPage.value).toBe('')
  expect(state.canCopy.value).toBe(false)
})

it('does not replace a selected no-ID alias with an ID-bearing page sharing its path', async () => {
  const initial = context()
  initial.pages = [
    { name: 'Stable', pageId: 'home', path: 'index.html' },
    { name: 'Legacy alias', path: 'index.html' },
  ]
  const { state } = await setup('/preview/p1/v1?revisionId=r1&pageId=home', false, initial)
  state.select('index.html')
  await flushPromises()
  expect(state.selectedPage.value?.name).toBe('Legacy alias')
  expect(state.pageId.value).toBeUndefined()
  expect(state.canCopy.value).toBe(false)
  await state.copyCurrentPage()
  expect(copyText).not.toHaveBeenCalled()
})
it('preserves the exact selected tree label when several legacy aliases share a path', async () => {
  const initial = context()
  initial.pages = [
    { name: 'Stable', pageId: 'home', path: 'index.html' },
    { name: 'Legacy A', path: 'index.html' },
    { name: 'Legacy B', path: 'index.html' },
  ]
  const { wrapper } = await setup('/preview/p1/v1?revisionId=r1&pageId=home', true, initial)
  await wrapper.findAll('.workspace-nav .tree-page')[2].trigger('click')
  await flushPromises()
  expect(wrapper.get('.workspace-current').text()).toContain('Legacy B')
  expect(wrapper.get('.workspace-current button').attributes('disabled')).toBeDefined()
  expect(wrapper.get('.ant-tree-node-selected .tree-page').text()).toBe('Legacy B')
  expect(wrapper.get('iframe').attributes('src')).toMatch(/index.html$/)
})
