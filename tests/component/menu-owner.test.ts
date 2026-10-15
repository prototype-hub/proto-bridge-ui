import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useMenus } from '@/modules/authentication-manager-ui/views/menu/hooks/useMenus'
import { menuManagement } from '@/modules/authentication-manager-ui/api/menu/menu'
import type { ServerMenu } from '@/shared/auth/types'

vi.mock('@/modules/authentication-manager-ui/api/menu/menu', () => ({
  menuManagement: {
    list: vi.fn(),
    detail: vi.fn(),
    validate: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  },
}))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn(), deleted: vi.fn() }))
const proto: ServerMenu = { id: 'proto-menu', code: 'proto-menu', name: '菜单', owner: 'proto' }
const legacy: ServerMenu = { id: 'legacy-menu', code: 'legacy-menu', name: '旧菜单', owner: 'iot' }
let page: ReturnType<typeof useMenus>, wrapper: VueWrapper
beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(menuManagement.list).mockResolvedValue([proto, legacy])
  vi.mocked(menuManagement.validate).mockResolvedValue({ passed: true })
  vi.mocked(menuManagement.save).mockResolvedValue({ id: 'saved', code: 'saved', name: 'Saved' })
  vi.mocked(menuManagement.detail).mockResolvedValue({ ...proto, id: 'saved' })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => h('div') } }],
  })
  await router.push('/')
  wrapper = mount(
    {
      setup() {
        page = useMenus()
        return () => h('div')
      },
    },
    { global: { plugins: [createPinia(), router] } },
  )
  await flushPromises()
})
afterEach(() => wrapper.unmount())
it('edits a loaded proto menu without rewriting owner and excludes legacy parents', async () => {
  page.edit(proto)
  page.form.value.name = '修改后的菜单'
  await page.save()
  expect(menuManagement.save).toHaveBeenCalledWith(
    expect.objectContaining({ owner: 'proto', name: '修改后的菜单' }),
    false,
  )
  page.edit(proto)
  expect(page.parents.value.some((row) => row.value === legacy.id)).toBe(false)
})
it('inherits the final chosen parent owner for a new child and keeps ordinary new roots on the API legacy default', async () => {
  page.edit(undefined, legacy)
  page.form.value.parentId = proto.id
  page.form.value.code = 'child'
  page.form.value.name = '新子菜单'
  await page.save()
  expect(menuManagement.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ parentId: proto.id, owner: 'proto' }),
    true,
  )
  page.edit()
  expect(page.form.value.owner).toBe('iot')
})
