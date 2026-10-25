import type { LocationQuery, Router } from 'vue-router'
import type { ServerMenu } from '@/shared/auth/types'
import {
  componentMap,
  componentAliases,
  menuPathMap,
  projectComponentCode,
  recycleComponentCode,
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

/** Only a currently granted, registered menu can host recovery; never synthesize a bypass route. */
export function recycleListLocation(
  router: Pick<Router, 'getRoutes'>,
  menus: ServerMenu[],
  projectId?: string,
) {
  function menuIds(nodes: ServerMenu[], parentPath = ''): string[] {
    return nodes.flatMap((menu) => {
      if (menu.granted === false || menu.options?.show === false) return []
      const path = menu.url?.startsWith('/')
        ? menu.url
        : `${parentPath}/${menu.url || ''}`.replace(/\/+/g, '/')
      return [
        ...(resolveProjectMenuComponent(menu, path)?.code === recycleComponentCode
          ? [menu.id]
          : []),
        ...menuIds(menu.children || [], path),
      ]
    })
  }
  const names = new Set(menuIds(menus).map((id) => `menu:${id}`))
  const registered = router
    .getRoutes()
    .find((route) => !route.aliasOf && names.has(String(route.name)))
  if (!registered) return undefined
  return {
    path: registered.path,
    query: { tab: 'versions', ...(projectId ? { projectId } : {}) },
  }
}
