import type { ServerMenu } from '@/shared/auth/types'
export function flattenMenus(
  menus: ServerMenu[],
  depth = 0,
): { menu: ServerMenu; depth: number }[] {
  return menus.flatMap((menu) => [{ menu, depth }, ...flattenMenus(menu.children || [], depth + 1)])
}
export function serializeGrants(menus: ServerMenu[]): ServerMenu[] {
  function selected(menu: ServerMenu): boolean {
    return menu.granted === true || (menu.children || []).some(selected)
  }
  return flattenMenus(menus)
    .filter(({ menu }) => selected(menu))
    .map(({ menu }) => ({
      ...menu,
      granted: true,
      children: undefined,
      buttons: (menu.buttons || [])
        .filter((button) => menu.granted && button.granted)
        .map((button) => ({ ...button, granted: true })),
    }))
}
