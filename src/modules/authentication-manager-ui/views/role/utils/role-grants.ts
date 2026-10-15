import type { GrantMenu } from '@/modules/authentication-manager-ui/types/role'
export type { AssetAccess, GrantMenu } from '@/modules/authentication-manager-ui/types/role'
import type { ServerMenu, MenuButton } from '@/shared/auth/types'
import { isRecord } from '@/modules/authentication-manager-ui/utils/model'
const protectedMenu = (menu: GrantMenu) => menu.code === 'account-center'
export const protectedButton = (menu: GrantMenu, button: MenuButton) =>
  protectedMenu(menu) && button.id === 'view'
export const supportsData = (menu: GrantMenu) =>
  (isRecord(menu.accessSupport) ? menu.accessSupport.value : menu.accessSupport) === 'support'
export function flatGrants(menus: GrantMenu[], depth = 0): { menu: GrantMenu; depth: number }[] {
  return menus.flatMap((menu) => [{ menu, depth }, ...flatGrants(menu.children || [], depth + 1)])
}
export function normalizeGrants(menus: ServerMenu[]): GrantMenu[] {
  const copy: GrantMenu[] = JSON.parse(JSON.stringify(menus)) as GrantMenu[]
  function normalize(rows: GrantMenu[]): GrantMenu[] {
    return rows
      .filter(
        (menu) =>
          menu.code !== 'message-subscribe' &&
          (!isRecord(menu.options) || menu.options.show !== false),
      )
      .map((menu) => {
        menu.children = normalize(menu.children || [])
        if (protectedMenu(menu)) {
          menu.granted = true
          menu.buttons?.forEach((button) => {
            if (protectedButton(menu, button)) button.granted = true
          })
        }
        return menu
      })
  }
  const rows = normalize(copy)
  updateGrantStates(rows)
  return rows
}
function dataDefault(menu: GrantMenu, selected: boolean) {
  if (!supportsData(menu)) return
  if (!selected)
    menu.assetAccesses?.forEach((access) => {
      access.granted = false
    })
  else if (!menu.assetAccesses?.some((access) => access.granted))
    menu.assetAccesses?.forEach((access) => {
      access.granted = access.supportId === 'creator'
    })
}
export function updateGrantStates(menus: GrantMenu[]) {
  for (const menu of menus) {
    updateGrantStates(menu.children || [])
    const options = [
      ...(menu.children || []).map((child) => ({
        granted: child.granted,
        partial: child.indeterminate,
      })),
      ...(menu.buttons || []).map((button) => ({ granted: button.granted, partial: false })),
    ]
    if (options.length) {
      menu.granted = options.every((option) => option.granted)
      menu.indeterminate =
        !menu.granted && options.some((option) => option.granted || option.partial)
    } else menu.indeterminate = false
    if (protectedMenu(menu)) menu.granted = true
    if (menu.granted || menu.indeterminate) dataDefault(menu, true)
  }
}
export function setMenuGrant(menus: GrantMenu[], menu: GrantMenu, checked: boolean) {
  function apply(row: GrantMenu) {
    row.granted = protectedMenu(row) || checked
    row.indeterminate = false
    row.buttons?.forEach((button) => {
      button.granted = protectedButton(row, button) || checked
    })
    row.children?.forEach(apply)
    dataDefault(row, !!row.granted)
  }
  apply(menu)
  updateGrantStates(menus)
}
export function setAllGrants(menus: GrantMenu[], checked: boolean) {
  menus.forEach((menu) => setMenuGrant(menus, menu, checked))
  updateGrantStates(menus)
}
export function setDataGrant(menu: GrantMenu, value: string) {
  menu.assetAccesses?.forEach((access) => {
    access.granted = access.supportId === value
  })
}
export function serializeRoleGrants(menus: GrantMenu[]): ServerMenu[] {
  updateGrantStates(menus)
  return flatGrants(menus)
    .filter(({ menu }) => menu.granted || menu.indeterminate)
    .map(({ menu }) => {
      const {
        children: _children,
        indeterminate: _partial,
        selectAccesses: _selected,
        ...row
      } = menu
      return {
        ...row,
        id: String(menu.id),
        code: String(menu.code),
        name: String(menu.name),
        granted: true,
        buttons: (menu.buttons || []).map((button) => ({ ...button })),
        assetAccesses: menu.assetAccesses?.map((access) => ({ ...access })),
      }
    })
}
