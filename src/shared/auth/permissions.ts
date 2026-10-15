import type { ServerMenu, ResourcePermission } from './types'
export function permissionSet(
  menus: ServerMenu[],
  resources: ResourcePermission[] = [],
): Set<string> {
  const permissions = new Set<string>()
  const addResources = (values: ResourcePermission[]) =>
    values.forEach((value) =>
      value.actions.forEach((action) => {
        const id = value.id || value.permission
        if (id) permissions.add(`${id}:${action}`)
      }),
    )
  const visit = (nodes: ServerMenu[]) =>
    nodes.forEach((menu) => {
      if (menu.granted === false) return
      menu.buttons
        ?.filter((button) => button.granted !== false)
        .forEach((button) => permissions.add(`${menu.code}:${button.id}`))
      visit(menu.children || [])
    })
  visit(menus)
  addResources(resources)
  return permissions
}
export const hasPermission = (permissions: Set<string>, requested: string | string[]): boolean =>
  (Array.isArray(requested) ? requested : [requested]).some((value) => permissions.has(value))
