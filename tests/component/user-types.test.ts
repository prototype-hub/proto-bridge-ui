import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import UsersView from '@/modules/authentication-manager-ui/views/user/index.vue'
import type { QueryField } from '@/shared/api/types'
import { usersApi } from '@/modules/authentication-manager-ui/api/user/users'
import { request } from '@/shared/api/client'
import { i18n } from '@/shared/i18n'
import { localeMessages } from '@/modules/authentication-manager-ui/locale-messages'
import { permissionKey } from '@/shared/auth/provider'
import type { ManagedUser, UserTypeValue } from '@/modules/authentication-manager-ui/types/user'
import { identityRows } from '../fixtures/identity-query'
import { userTypes } from '../fixtures/system-data'

vi.mock('@/shared/api/client', () => ({ request: { get: vi.fn() } }))
vi.mock('@/modules/authentication-manager-ui/api/user/users', () => ({
  usersApi: { list: vi.fn() },
}))
vi.mock('@/modules/authentication-manager-ui/api/role/roles', () => ({
  rolesApi: { all: vi.fn(async () => []) },
}))
vi.mock('@/modules/authentication-manager-ui/api/role/role-options', () => ({
  roleIdentityApi: { roleOptions: vi.fn(async () => []) },
}))
vi.mock('@/modules/authentication-manager-ui/api/position/position-options', () => ({
  positionIdentityApi: { positions: vi.fn(async () => []) },
}))
vi.mock('@/modules/authentication-manager-ui/hooks/form-options', () => ({
  formOptions: vi.fn(async () => ({})),
}))

const wrappers: ReturnType<typeof mount>[] = []
function user(id: string, type?: UserTypeValue): ManagedUser {
  return { id, username: id, name: id, status: 1, type }
}
async function users(rows: ManagedUser[]) {
  vi.mocked(usersApi.list).mockImplementation(async (query) => {
    const data = identityRows(rows, query) as ManagedUser[]
    return { data, total: data.length, pageIndex: 0, pageSize: 20 }
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
  })
  await router.push('/')
  const wrapper = mount(UsersView, {
    global: {
      plugins: [i18n, router],
      provide: { [permissionKey as symbol]: { can: () => true } },
      // Keep the real query/table path; account actions and editors are outside this contract.
      stubs: {
        QueryHistory: true,
        UserEditor: true,
        AModal: true,
        ActionButton: true,
        PermissionButton: true,
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', localeMessages.zh)
  vi.mocked(request.get).mockResolvedValue({ success: true, status: 200, result: userTypes })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  const style = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => style(element))
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('user type rendering and queries', () => {
  it('renders each row server text before option labels or compatibility typeId', async () => {
    const wrapper = await users([
      {
        ...user('normal-row', { value: 'normal', id: 'normal', text: '后端普通用户' }),
        typeId: 'admin',
      },
      user('admin-row', { value: 'admin', id: 'admin', text: '后端管理员' }),
      user('custom-row', { value: 'custom', text: '历史用户类型' }),
    ])
    const table = wrapper.get('tbody')
    expect(table.text()).toContain('后端普通用户')
    expect(table.text()).toContain('后端管理员')
    expect(table.text()).toContain('历史用户类型')
    expect(table.text()).not.toContain('[object Object]')
  })

  it('resolves released string/id types with server options and preserves unknown identifiers', async () => {
    const wrapper = await users([
      user('old-normal', 'normal'),
      user('old-admin', { id: 'admin' }),
      user('old-label', { id: 'normal', name: '历史自定义名称' }),
      user('unknown', 'retired-type'),
      user('missing'),
    ])
    const table = wrapper.get('tbody')
    for (const text of ['普通用户', '管理员', '历史自定义名称', 'retired-type', '--'])
      expect(table.text()).toContain(text)
    expect(table.text()).not.toContain('{"id"')
  })

  it.each(['normal', 'admin'])(
    'sends the %s identifier and filters enum objects by value',
    async (value) => {
      vi.mocked(request.get).mockResolvedValue({
        success: true,
        status: 200,
        result: userTypes.map((type) => ({ ...type, id: `compat-${type.id}` })),
      })
      const wrapper = await users(userTypes.map((type) => user(`${type.value}-row`, type)))
      const table = wrapper.findComponent({ name: 'QueryTable' })
      const fields: QueryField[] = table.props('fields')
      const field = fields.find((item) => item.key === 'type')
      expect(field?.options).toEqual([
        { value: 'normal', label: '普通用户' },
        { value: 'admin', label: '管理员' },
      ])
      const option = field?.options?.find((item) => item.value === value)
      table.vm.$emit('search', {
        terms: [{ column: 'type', termType: 'eq', value: option?.value }],
      })
      await flushPromises()
      expect(usersApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ terms: [{ column: 'type', termType: 'eq', value }] }),
        expect.anything(),
      )
      const rows: ManagedUser[] = table.props('rows')
      expect(rows.map((row) => row.id)).toEqual([`${value}-row`])
    },
  )
})
