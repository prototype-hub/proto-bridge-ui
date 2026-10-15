import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useNavigation } from '@/app/composables/useNavigation'
import { useSession } from '@/app/stores/session'
import { accountRoutes } from '@/modules/authentication-manager-ui'
import type { ServerMenu } from '@/shared/auth/types'
import { systemMenus } from '../fixtures/system-menu'

const menus = systemMenus([
  { id: 'proto', code: 'protohub/Project', name: '原型', url: '/protohub/projects' },
  { id: 'user', code: 'system/User', name: '用户', url: '/system/user' },
  { id: 'role', code: 'system/Role', name: '角色', url: '/system/Role' },
  { id: 'menu', code: 'system/Menu', name: '菜单', url: '/system/Menu' },
  { id: 'permission', code: 'system/Permission', name: '权限', url: '/system/Permission' },
  { id: 'log', code: 'Log/Access', name: '日志', url: '/logger/access' },
])

const wrappers: VueWrapper[] = []
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

async function navigationHarness(path: string, grants: ServerMenu[] = menus) {
  const pinia = createPinia()
  const session = useSession(pinia)
  session.menus = grants
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      '/account/center',
      '/account/center/bind',
      '/protohub/projects',
      '/system/user',
      '/system/positions',
      '/system/Department',
    ].map((route) => ({
      path: route,
      component: { render: () => null },
      meta: accountRoutes.find((record) => record.path === route)?.meta,
    })),
  })
  await router.push(path)
  await router.isReady()
  let navigation!: ReturnType<typeof useNavigation>
  const wrapper = mount(
    defineComponent({
      setup() {
        navigation = useNavigation()
        return () => null
      },
    }),
    { global: { plugins: [pinia, router, createI18n({ legacy: false, locale: 'zh' })] } },
  )
  wrappers.push(wrapper)
  return { navigation, session, router }
}

describe('navigation state', () => {
  it('keeps the account sidebar hidden while restoring authorized top menus after hydration', async () => {
    const { navigation, session } = await navigationHarness('/account/center', [])
    expect(navigation.collapsed.value).toBe(false)
    expect(navigation.showSidebar.value).toBe(false)
    expect(navigation.navigation.value.primary).toEqual([])
    expect(navigation.navigation.value.secondary).toEqual([])
    session.menus = menus
    await nextTick()
    expect(navigation.navigation.value.primary.map((item) => item.title)).toEqual([
      '原型',
      '系统管理',
    ])
    expect(navigation.navigation.value.root?.title).toBe('系统管理')
    expect(navigation.showSidebar.value).toBe(false)
    expect(navigation.openKeys.value).toEqual([])
  })

  it('starts with a full sidebar and closed subgroups even on an active third-level page or mobile', async () => {
    const { navigation, router } = await navigationHarness('/system/positions')
    expect(navigation.collapsed.value).toBe(false)
    expect(navigation.showSidebar.value).toBe(true)
    expect(navigation.openKeys.value).toEqual([])
    expect(navigation.navigation.value.selectedKeys).toEqual(['/system/positions'])
    navigation.mobileOpen.value = true
    await nextTick()
    expect(navigation.openKeys.value).toEqual([])
    const organization = navigation.navigation.value.secondary[1].key
    navigation.openKeys.value = [organization]
    navigation.collapsed.value = true
    await navigation.navigate('/system/Department')
    await nextTick()
    expect(router.currentRoute.value.path).toBe('/system/Department')
    expect(navigation.mobileOpen.value).toBe(false)
    expect(navigation.collapsed.value).toBe(true)
    expect(navigation.openKeys.value).toEqual([organization])
    expect(navigation.navigation.value.selectedKeys).toEqual(['/system/Department'])
  })

  it('closes subgroups when selecting a top module and never derives expansion from its first page', async () => {
    const { navigation, router } = await navigationHarness('/system/user')
    const root = navigation.navigation.value.root!
    navigation.openKeys.value = root.children!.map((item) => item.key)
    await navigation.primary(root.key)
    await nextTick()
    expect(router.currentRoute.value.path).toBe('/system/user')
    expect(navigation.openKeys.value).toEqual([])
    navigation.openKeys.value = [root.children![0].key]
    await router.push('/protohub/projects')
    await nextTick()
    expect(navigation.showSidebar.value).toBe(false)
    expect(navigation.openKeys.value).toEqual([])
    await navigation.primary(root.key)
    await nextTick()
    expect(navigation.showSidebar.value).toBe(true)
    expect(navigation.openKeys.value).toEqual([])
  })

  it('keeps binding routes protected and hides their sidebar and an already open mobile menu', async () => {
    for (const path of ['/account/center', '/account/center/bind']) {
      const record = accountRoutes.find((route) => route.path === path)!
      expect(record.meta?.hideSidebar).toBe(true)
      expect(record.meta?.standalone).not.toBe(true)
    }
    const { navigation } = await navigationHarness('/system/user')
    navigation.mobileOpen.value = true
    await navigation.navigate('/account/center/bind')
    await nextTick()
    expect(navigation.showSidebar.value).toBe(false)
    expect(navigation.mobileOpen.value).toBe(false)
    expect(navigation.navigation.value.primary.map((item) => item.title)).toEqual([
      '原型',
      '系统管理',
    ])
  })
})
