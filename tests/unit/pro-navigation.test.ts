import { describe, it, expect } from 'vitest'
import { splitNavigation, firstPage, menuTrail } from '@/app/router/navigation'
import { menuDisplayName } from '@/shared/auth/menu-display'
import { adaptMenus } from '@/app/router/menu-adapter'
import { systemMenus } from '../fixtures/system-menu'
const menus = systemMenus([
  { id: 'proto', code: 'protohub/Project', name: '原型', url: '/protohub/projects' },
  { id: 'user', code: 'system/User', name: '用户', url: '/system/user' },
  { id: 'role', code: 'system/Role', name: '角色', url: '/system/Role' },
  { id: 'menu', code: 'system/Menu', name: '菜单', url: '/system/Menu' },
  { id: 'permission', code: 'system/Permission', name: '权限', url: '/system/Permission' },
  { id: 'log', code: 'Log/Access', name: '日志', url: '/logger/access' },
])
describe('Pro mixed navigation', () => {
  it('places roots on top and keeps second and third levels in the sidebar', () => {
    const links = adaptMenus(menus).links
    const nav = splitNavigation(links, '/system/user')
    expect(nav.primary.map((row) => row.title)).toEqual(['原型', '系统管理'])
    expect(nav.secondary[0].title).toBe('权限管理')
    expect(nav.secondary[0].children?.[0].title).toBe('用户')
    expect(nav.trail.map((row) => row.title)).toEqual(['系统管理', '权限管理', '用户'])
  })
  it('restores the correct root after a direct detail refresh', () => {
    const links = adaptMenus(menus).links
    expect(menuTrail(links, '/system/Role/Detail/ADMIN').at(-1)?.code).toBe('system/Role')
    expect(firstPage(links[1])).toBe('/system/user')
    expect(splitNavigation(links, '/system/Role/Detail/ADMIN').root?.title).toBe('系统管理')
  })
  it('installs detail routes only for granted and registered page menus', () => {
    const adapted = adaptMenus(menus)
    expect(adapted.routes.some((row) => row.path === '/system/Role/Detail/:id')).toBe(true)
    expect(adaptMenus([{ ...menus[1], granted: false }]).routes).toEqual([])
    expect(
      adaptMenus([{ id: 'unsafe', code: 'unknown', name: 'Unknown', url: '/unknown' }]).routes,
    ).toEqual([])
  })
  it('keeps authorized top-level context on account refresh without personal entries', () => {
    const links = adaptMenus(menus).links
    const nav = splitNavigation(links, '/account/center')
    expect(nav.primary).toBe(links)
    expect(nav.primary.map((item) => item.title)).toEqual(['原型', '系统管理'])
    expect(nav.root).toBe(links[1])
    expect(nav.secondary).toBe(links[1].children)
    expect(nav.trail).toEqual([])
    expect(nav.selectedKeys).toEqual([])
    expect(firstPage(links[0])).toBe('/protohub/projects')
    expect(
      adaptMenus([{ id: 'self', code: 'system/User', name: 'Self', url: '/account/center' }])
        .routes,
    ).toEqual([])
  })
  it('does not invent a sidebar or personal entry for a leaf-only grant or empty menus', () => {
    const links = adaptMenus([menus[0]]).links
    const leafOnly = splitNavigation(links, '/account/center')
    expect(leafOnly.primary).toEqual(links)
    expect(leafOnly.root).toBe(links[0])
    expect(leafOnly.secondary).toEqual([])
    const empty = splitNavigation([], '/account/center')
    expect(empty.primary).toEqual([])
    expect(empty.root).toBeUndefined()
    expect(empty.secondary).toEqual([])
  })
  it('uses only granted roots as account fallback and keeps a matching leaf route active', () => {
    const links = adaptMenus([menus[0], { ...menus[1], granted: false }]).links
    expect(splitNavigation(links, '/account/center').primary.map((item) => item.title)).toEqual([
      '原型',
    ])
    expect(splitNavigation(links, '/account/center').secondary).toEqual([])
    const allLinks = adaptMenus(menus).links
    expect(splitNavigation(allLinks, '/protohub/projects').root).toBe(allLinks[0])
    expect(splitNavigation(allLinks, '/protohub/projects').secondary).toEqual([])
  })
  it('resolves English metadata and its language fallback without overwriting the default name', () => {
    const menu = {
      name: '中文',
      i18nMessages: { name: { zh_CN: '中文更新', en: 'English', fr: 'Français' } },
    }
    expect(menuDisplayName(menu, 'en')).toBe('English')
    expect(menuDisplayName(menu, 'zh')).toBe('中文更新')
    expect(menu.name).toBe('中文')
    expect(menuDisplayName({ name: 'Default' }, 'en')).toBe('Default')
  })
})
