import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { request } from '@/shared/api/client'
import { i18n } from '@/shared/i18n'
import { permissionKey } from '@/shared/auth/provider'
import { useMenus } from '@/modules/authentication-manager-ui/views/menu/hooks/useMenus'
import RolesView from '@/modules/authentication-manager-ui/views/role/index.vue'
import PositionsView from '@/modules/authentication-manager-ui/views/position/index.vue'
import { hookHarness } from '../fixtures/hook-harness'

vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
const response = (result: unknown) => ({ success: true, status: 200, result })
const wrappers: VueWrapper[] = []
beforeEach(() => {
  vi.mocked(request.get).mockReset().mockResolvedValue(response([]))
  vi.mocked(request.post)
    .mockReset()
    .mockResolvedValue(response({ data: [], total: 0, pageIndex: 0, pageSize: 20 }))
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))
it.each(['menu', 'role', 'position'] as const)(
  'keeps the latest %s detail when route A completes after route B',
  async (kind) => {
    let finishOld!: (value: ReturnType<typeof response>) => void
    const old = new Promise<ReturnType<typeof response>>((done) => {
      finishOld = done
    })
    const row = (id: string) => ({ id, name: id, code: id, owner: 'proto' })
    if (kind === 'position') {
      const original = vi.mocked(request.post).getMockImplementation()!
      vi.mocked(request.post).mockImplementation(async (path, data, ...args) => {
        if (path === '/position/_query/detail/no-paging') {
          const id = (data as { terms: { value: string }[] }).terms[0]!.value
          return id === 'A' ? old : response([row(id)])
        }
        return original(path, data, ...args)
      })
    } else {
      vi.mocked(request.get).mockImplementation(async (path) =>
        path.endsWith('/A') ? old : response(path.endsWith('/B') ? row('B') : []),
      )
    }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/detail/:id', component: { render: () => h('div') } }],
    })
    await router.push('/detail/A')
    let menus!: ReturnType<typeof useMenus>
    const component =
      kind === 'menu'
        ? hookHarness(() => {
            menus = useMenus()
          })
        : kind === 'role'
          ? RolesView
          : PositionsView
    const wrapper = mount(component, {
      global: {
        plugins: [router, createPinia(), i18n],
        provide: { [permissionKey]: { can: () => true } },
        stubs: {
          QueryTable: true,
          RoleGroups: true,
          RoleDetail: true,
          FormModal: true,
          PositionDetailsPanel: {
            name: 'PositionDetailsPanel',
            props: ['record'],
            template: '<div />',
          },
          ADrawer: { template: '<div><slot /></div>' },
        },
      },
    })
    wrappers.push(wrapper)
    await flushPromises()
    await router.push('/detail/B')
    await flushPromises()
    const selected = () =>
      kind === 'menu'
        ? menus.form.value.id
        : kind === 'role'
          ? wrapper.findComponent({ name: 'RoleDetail' }).props('role')?.id
          : wrapper.findComponent({ name: 'PositionDetailsPanel' }).props('record')?.id
    expect(selected()).toBe('B')
    finishOld(response(kind === 'position' ? [row('A')] : row('A')))
    await flushPromises()
    expect(selected()).toBe('B')
  },
)
