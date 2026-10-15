import type { RouteRecordRaw } from 'vue-router'
import type { ServerMenu } from '@/shared/auth/types'
import { resolveMenuComponent, menuPathMap } from '@/app/modules/registry'
import { menuDisplayName } from '@/shared/auth/menu-display'
import { isSafeMenuPath } from '@/shared/router/menu-entry'
export interface MenuLink {
  key: string
  title: string
  code: string
  icon?: string
  children?: MenuLink[]
}
export function adaptMenus(
  menus: ServerMenu[],
  language = 'zh',
): { routes: RouteRecordRaw[]; links: MenuLink[] } {
  const routes: RouteRecordRaw[] = []
  const used = new Set<string>()
  function walk(nodes: ServerMenu[], parentPath = ''): MenuLink[] {
    return [...nodes]
      .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0))
      .flatMap((menu) => {
        if (menu.granted === false || menu.options?.show === false) return []
        const segment = menu.url || ''
        const path = segment.startsWith('/')
          ? segment
          : `${parentPath}/${segment}`.replace(/\/+/g, '/')
        const safe = isSafeMenuPath(path)
        const resolved = resolveMenuComponent(menu, path)
        const children = walk(menu.children || [], safe ? path : parentPath)
        const title = menuDisplayName(menu, language)
        if (resolved && safe && !used.has(path)) {
          used.add(path)
          routes.push({
            path,
            name: `menu:${menu.id}`,
            component: resolved.component,
            meta: { menuCode: menu.code, menuComponentCode: resolved.code, title },
          })
          const extensions: Record<string, string[]> = {
            'system/Role': ['Detail/:id'],
            'system/Menu': ['Setting', 'Detail/:id'],
            'system/Positions': ['Detail/:id'],
          }
          for (const suffix of extensions[resolved.code] || [])
            routes.push({
              path: `${path}/${suffix}`,
              name: `menu:${menu.id}:${suffix}`,
              component: resolved.component,
              meta: { menuCode: menu.code, menuComponentCode: resolved.code, title },
            })
          return [
            {
              key: path,
              title,
              code: menu.code,
              icon: menu.icon,
              children: children.length ? children : undefined,
            },
          ]
        }
        return children.length
          ? [{ key: `group:${menu.id}`, title, code: menu.code, icon: menu.icon, children }]
          : []
      })
  }
  const links = walk(menus)
  const aliased = new Set<string>()
  for (const route of routes) {
    if (aliased.has(String(route.meta?.menuComponentCode))) continue
    if (route.meta?.menuComponentCode !== 'prototype-hub/Project') continue
    const aliases = Object.entries(menuPathMap)
      .filter(([path, entry]) => entry?.code === route.meta?.menuComponentCode && !used.has(path))
      .map(([path]) => path)
    if (aliases.length) route.alias = aliases
    aliased.add(String(route.meta.menuComponentCode))
  }
  return { routes, links }
}
