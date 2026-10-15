import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { menuManagement } from '@/modules/authentication-manager-ui/api/menu/menu'
import { useMenus } from '@/modules/authentication-manager-ui/views/menu/hooks/useMenus'
import type { ServerMenu } from '@/shared/auth/types'
import { i18n } from '@/shared/i18n'
import { localeMessages } from '@/modules/authentication-manager-ui/locale-messages'

vi.mock('@/modules/authentication-manager-ui/api/menu/menu', () => ({
  menuManagement: { list: vi.fn(), detail: vi.fn(), validate: vi.fn(), save: vi.fn() },
}))
vi.mock('@/app/stores/session', () => ({
  useSession: () => ({ initialized: false, refreshMenus: vi.fn() }),
}))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn(), deleted: vi.fn() }))

const wrappers: ReturnType<typeof mount>[] = []
let persisted: ServerMenu
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.mergeLocaleMessage('zh', localeMessages.zh)
  vi.mocked(menuManagement.list).mockResolvedValue([])
  vi.mocked(menuManagement.validate).mockResolvedValue({ passed: true })
  vi.mocked(menuManagement.save).mockImplementation(async (input) => {
    persisted = JSON.parse(JSON.stringify({ ...input, id: input.id || 'new-menu' }))
    return persisted
  })
  vi.mocked(menuManagement.detail).mockImplementation(async () => structuredClone(persisted))
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

async function editor() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/system/menu', component: { render: () => null } }],
  })
  await router.push('/system/menu')
  let state!: ReturnType<typeof useMenus>
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          state = useMenus()
          return () => h('div')
        },
      }),
      { global: { plugins: [router] } },
    ),
  )
  await flushPromises()
  return state
}

it('creates a menu from its page address without requiring or synthesizing a component binding', async () => {
  const state = await editor()
  state.edit()
  expect(state.form.value).not.toHaveProperty('componentCode')
  Object.assign(state.form.value, {
    name: '用户入口',
    code: 'custom-users',
    url: '/system/user',
    icon: 'AppstoreOutlined',
  })
  await state.save()
  expect(menuManagement.validate).toHaveBeenCalledWith('custom-users')
  expect(menuManagement.save).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'custom-users', url: '/system/user' }),
    true,
  )
  expect(persisted).not.toHaveProperty('componentCode')
  expect(persisted.options?.meta).not.toHaveProperty('componentCode')
  expect(state.task.error.value).toBe('')
  expect(state.creating.value).toBe(false)
})

it('preserves a legacy binding and other metadata through repeated edits without the removed selector', async () => {
  const state = await editor()
  const metadata = { componentCode: 'legacy/RegisteredPage', flag: 'preserved' }
  const old: ServerMenu = {
    id: 'legacy-menu',
    name: 'Legacy page',
    code: 'custom-code',
    url: '/custom/page',
    options: { show: true, meta: metadata },
  }
  state.edit(old)
  state.form.value.name = 'Updated page'
  await state.save()
  await state.save()
  expect(menuManagement.save).toHaveBeenCalledTimes(2)
  for (const [payload, creating] of vi.mocked(menuManagement.save).mock.calls) {
    expect(creating).toBe(false)
    expect(payload.options?.meta).toEqual({
      componentCode: 'legacy/RegisteredPage',
      flag: 'preserved',
    })
  }
  expect(old.name).toBe('Legacy page')
  expect(old.options?.meta?.componentCode).toBe('legacy/RegisteredPage')
  expect(state.task.error.value).toBe('')
})
