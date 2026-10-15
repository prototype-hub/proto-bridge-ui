import type { LocationQuery, Router } from 'vue-router'
import type { ServerMenu } from '@/shared/auth/types'
import {
  componentMap,
  componentAliases,
  menuPathMap,
  projectComponentCode,
  resolveProjectMenuComponent,
} from '../menu-entry'
import { resolveMenuEntryCode } from '@/shared/router/menu-entry'

/** Resolve the registered project menu rather than assuming its administrator-configurable URL. */
export function projectListLocation(
  router: Pick<Router, 'getRoutes'>,
  menus: ServerMenu[],
  query: LocationQuery = {},
) {
  function projectMenuIds(nodes: ServerMenu[], parentPath = ''): string[] {
    return nodes.flatMap((menu) => {
      if (menu.granted === false || menu.options?.show === false) return []
      const path = menu.url?.startsWith('/')
        ? menu.url
        : `${parentPath}/${menu.url || ''}`.replace(/\/+/g, '/')
      return [
        ...(resolveProjectMenuComponent(menu, path)?.code === projectComponentCode
          ? [menu.id]
          : []),
        ...projectMenuIds(menu.children || [], path),
      ]
    })
  }
  const names = new Set(projectMenuIds(menus).map((id) => `menu:${id}`))
  const registered = router.getRoutes().find((route) => {
    if (route.aliasOf || !String(route.name).startsWith('menu:')) return false
    const code = route.meta.menuComponentCode || route.meta.menuCode
    if (typeof route.meta.menuComponentCode === 'string') return code === projectComponentCode
    return (
      names.has(String(route.name)) ||
      (typeof code === 'string' &&
        resolveMenuEntryCode(code, { componentMap, componentAliases, menuPathMap })?.code ===
          projectComponentCode)
    )
  })
  return { path: registered?.path || '/', query: { ...query } }
}
