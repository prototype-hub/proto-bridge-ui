import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createPinia } from 'pinia'
import { hookHarness } from '../fixtures/hook-harness'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { request } from '@/shared/api/client'
import { i18n } from '@/shared/i18n'
import { permissionKey } from '@/shared/auth/provider'
import { localeMessages } from '@/modules/authentication-manager-ui/locale-messages'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import PrototypeListToolbar from '@/modules/protohub-manager-ui/views/project/components/PrototypeListToolbar.vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import RecycleView from '@/modules/protohub-manager-ui/views/recycle/index.vue'
import ProjectsView from '@/modules/protohub-manager-ui/views/project/index.vue'
import { useProjectDetail } from '@/modules/protohub-manager-ui/views/project/hooks/useProjectDetail'
import { ownerProjectAccess } from '../fixtures/project-access'

vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), put: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn(), deleted: vi.fn() }))
const wrappers: VueWrapper[] = []
const response = <T>(result: T) => ({ success: true, status: 200, result })
const project = {
  id: 'p1',
  name: '可恢复项目',
  createdBy: 'owner',
  createdAt: 1,
  updatedAt: 1,
  deletedTime: 2,
  ...ownerProjectAccess,
}
const capacity = { used: 0, limit: 5, remaining: 5, overLimit: false, canCreate: true }
let restored = false
beforeEach(() => {
  vi.resetAllMocks()
  restored = false
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { ...localeMessages.zh, proto: protoLocales.zh })
  i18n.global.mergeLocaleMessage('en', { ...localeMessages.en, proto: protoLocales.en })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
  vi.mocked(request.get).mockImplementation(async (path) =>
    response(
      path.endsWith('_usage')
        ? path.includes('/projects/')
          ? { projects: capacity }
          : { projectId: 'p1', versions: capacity }
        : project,
    ),
  )
  vi.mocked(request.post).mockImplementation(async (path) => {
    if (path.endsWith('/_restore')) {
      restored = true
      return response(true)
    }
    return response({
      data: path === '/prototype-hub/projects/_deleted/_query' && !restored ? [project] : [],
      total: restored ? 0 : 1,
      pageIndex: 0,
      pageSize: 20,
    })
  })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})
async function listPage(
  path = '/prototype-hub/recycle-bin',
  can: (value: string | string[]) => boolean = () => true,
) {
  let detail!: ReturnType<typeof useProjectDetail>
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/prototype-hub', component: ProjectsView },
      { path: '/prototype-hub/recycle-bin', component: RecycleView },
      {
        path: '/prototype-hub/projects/:id',
        name: 'project-detail',
        component: hookHarness(() => {
          detail = useProjectDetail()
        }),
      },
    ],
  })
  await router.push(path)
  const wrapper = mount(RouterView, {
    global: {
      plugins: [createPinia(), router, i18n],
      provide: { [permissionKey]: { can } },
      stubs: { ProjectDialog: true },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router, detail: () => detail }
}
it('reuses the framework condition row and submits a literal name only on explicit search', async () => {
  const keyword = ref('')
  const search = vi.fn()
  const reset = vi.fn()
  const wrapper = mount(
    defineComponent({
      setup() {
        return () =>
          h(PrototypeListToolbar, {
            keyword: keyword.value,
            sort: 'name:asc',
            'onUpdate:keyword': (value: string) => {
              keyword.value = value
            },
            onSearch: search,
            onReset: reset,
          })
      },
    }),
    { global: { plugins: [i18n] } },
  )
  wrappers.push(wrapper)
  expect(wrapper.find('.query-row-compact').exists()).toBe(true)
  expect(wrapper.findAll('.query-row').length).toBe(1)
  expect(wrapper.find('.query-remove-condition').exists()).toBe(false)
  const input = wrapper.get('input.query-value')
  await input.setValue('  100%_中文  ')
  expect(keyword.value).toBe('  100%_中文  ')
  expect(search).not.toHaveBeenCalled()
  await input.trigger('keydown', { key: 'Enter', keyCode: 13 })
  expect(search).toHaveBeenCalledTimes(1)
  await input.setValue('x'.repeat(129))
  expect(keyword.value).toHaveLength(128)
  const resetButton = wrapper
    .findAll('button')
    .find((button) => button.text().replace(/\s/g, '') === '重置')!
  await resetButton.trigger('click')
  expect(reset).toHaveBeenCalledOnce()
})
it('loads only deleted projects in the independent recycle page without creation or mode tabs', async () => {
  const { wrapper } = await listPage()
  expect(wrapper.get('h1').text()).toBe('回收站')
  expect(wrapper.text()).toContain('可恢复项目')
  expect(wrapper.text()).not.toContain('新建项目')
  expect(wrapper.find('.prototype-list-mode').exists()).toBe(false)
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/projects/_deleted/_query',
    expect.anything(),
    expect.anything(),
  )
  expect(request.post).not.toHaveBeenCalledWith(
    '/prototype-hub/projects/_query',
    expect.anything(),
    expect.anything(),
  )
})
it('opens only the restored parent version recycle scope and respects the query marker on initial load', async () => {
  const { wrapper, router, detail } = await listPage()
  wrapper
    .findAllComponents(ActionButton)
    .find((button) => button.props('label') === '恢复')!
    .vm.$emit('action')
  await flushPromises()
  const link = wrapper
    .findAll('button')
    .find((button) => button.text() === '查看该项目的版本回收站')!
  await link.trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/prototype-hub/projects/p1?recycle=versions')
  expect(detail().trash.value).toBe(true)
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/versions/_deleted/_query',
    expect.anything(),
    expect.objectContaining({ params: { projectId: 'p1' } }),
  )
  expect(request.post).not.toHaveBeenCalledWith(
    '/prototype-hub/versions/_query',
    expect.anything(),
    expect.anything(),
  )
})
it('does not offer project restoration to a query-only user', async () => {
  const { wrapper } = await listPage(undefined, (permission) =>
    String(permission).endsWith(':query'),
  )
  expect(
    wrapper.findAll('button').some((button) => button.attributes('aria-label') === '恢复'),
  ).toBe(false)
  expect(request.post).not.toHaveBeenCalledWith(
    '/prototype-hub/projects/p1/_restore',
    expect.anything(),
    expect.anything(),
  )
})
it('keeps the project page on the active query with no recycle page tabs', async () => {
  const { wrapper } = await listPage('/prototype-hub')
  expect(wrapper.get('h1').text()).toBe('原型项目')
  expect(wrapper.text()).toContain('新建项目')
  expect(wrapper.find('.prototype-list-mode').exists()).toBe(false)
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/projects/_query',
    expect.anything(),
    expect.anything(),
  )
  expect(request.post).not.toHaveBeenCalledWith(
    '/prototype-hub/projects/_deleted/_query',
    expect.anything(),
    expect.anything(),
  )
})
