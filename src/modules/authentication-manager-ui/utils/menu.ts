import type { AccessSupport } from '@/modules/authentication-manager-ui/types/menu'
export type { AccessSupport } from '@/modules/authentication-manager-ui/types/menu'
import type { ServerMenu, MenuButton, ResourcePermission } from '@/shared/auth/types'
import type { Query } from '@/shared/api/types'
import { t } from '@/shared/i18n'
import { isRecord } from '@/modules/authentication-manager-ui/utils/model'
// Ordinary CRUD keeps the backend's legacy default; loaded product owners remain authoritative.
export const DEFAULT_MENU_OWNER = 'iot'
export const cloneMenus = (menus: ServerMenu[]) => JSON.parse(JSON.stringify(menus)) as ServerMenu[]
export function accessSupport(value: unknown): AccessSupport {
  const candidate = isRecord(value) ? value.value : value
  return candidate === 'support' || candidate === 'indirect' ? candidate : 'unsupported'
}
function nullableArray(value: unknown): unknown[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error(t('common.invalid'))
  return value
}
function stringArray(value: unknown): string[] {
  const rows = nullableArray(value)
  if (!rows.every((row): row is string => typeof row === 'string'))
    throw new Error(t('common.invalid'))
  return [...rows]
}
function menuPermissions(value: unknown): ResourcePermission[] {
  return nullableArray(value).map((row) => {
    if (!isRecord(row)) throw new Error(t('common.invalid'))
    return { ...row, actions: stringArray(row.actions) }
  })
}

/** MenuEntity's nullable JSON collections need arrays before form controls read or edit them. */
export function normalizeMenu(value: unknown): ServerMenu {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    (value.code != null && typeof value.code !== 'string') ||
    (value.options != null && !isRecord(value.options))
  )
    throw new Error(t('common.invalid'))
  return {
    ...value,
    id: value.id,
    name: value.name,
    code: value.code ?? '',
    permissions: menuPermissions(value.permissions),
    indirectMenus: stringArray(value.indirectMenus),
    options: value.options == null ? {} : { ...value.options },
    buttons: nullableArray(value.buttons).map((button) => {
      if (!isRecord(button) || typeof button.id !== 'string' || typeof button.name !== 'string')
        throw new Error(t('common.invalid'))
      return {
        ...button,
        id: button.id,
        name: button.name,
        permissions: menuPermissions(button.permissions),
      }
    }),
    children: value.children == null ? undefined : normalizeMenuTree(value.children),
  }
}

/** Preserve enum envelopes and extension fields; malformed responses remain visible load errors. */
export function normalizeMenuTree(value: unknown): ServerMenu[] {
  if (!Array.isArray(value)) throw new Error(t('common.invalid'))
  return value.map(normalizeMenu)
}
/** Include current product menus and persisted legacy menus without changing their owners. */
export function menuQuery(query: Query = {}, includeHidden = false): Query {
  return {
    ...query,
    paging: false,
    sorts: [{ name: 'sortIndex', order: 'asc' }],
    terms: [
      ...(query.terms || []),
      {
        terms: [
          { column: 'owner', termType: 'eq', value: 'proto' },
          { column: 'owner', termType: 'eq', value: 'iot', type: 'or' },
          { column: 'owner', termType: 'isnull', value: '1', type: 'or' },
        ],
      },
      ...(includeHidden ? [] : [{ column: 'options', termType: 'nlike', value: '%show":false%' }]),
    ],
  }
}
export function descendants(menu: ServerMenu): string[] {
  return (menu.children || []).flatMap((child) => [child.id, ...descendants(child)])
}
export function findMenu(menus: ServerMenu[], id: string): ServerMenu | undefined {
  for (const row of menus) {
    if (row.id === id) return row
    const result = findMenu(row.children || [], id)
    if (result) return result
  }
}
export function menuDepth(menus: ServerMenu[], id: string, depth = 1): number {
  for (const row of menus) {
    if (row.id === id) return depth
    const childDepth = menuDepth(row.children || [], id, depth + 1)
    if (childDepth) return childDepth
  }
  return 0
}
export function treeDepth(menus: ServerMenu[]): number {
  return menus.length ? Math.max(...menus.map((menu) => 1 + treeDepth(menu.children || []))) : 0
}
/** Preserve immutable server ownership while converting form-only fields to API metadata. */
export function menuPayload(menu: ServerMenu): ServerMenu {
  const support = accessSupport(menu.accessSupport)
  const { componentCode, children: _children, ...fields } = menu
  const names: Record<string, string> = { ...menu.i18nMessages?.name, zh_CN: menu.name }
  for (const language of ['en_US', 'en']) {
    const value = names[language]?.trim()
    if (value) names[language] = value
    else delete names[language]
  }
  const output = {
    ...fields,
    ...(menu.i18nMessages
      ? {
          i18nMessages: {
            ...menu.i18nMessages,
            name: names,
          },
        }
      : {}),
    accessSupport: { value: support, label: t(`configuration.${support}`) },
    options: {
      ...menu.options,
      meta: {
        ...menu.options?.meta,
        ...(componentCode ? { componentCode } : {}),
      },
    },
  }
  if (!output.id) Reflect.deleteProperty(output, 'id')
  return output
}
/** Prevent invalid ancestry without changing the immutable owner of an existing menu. */
export function validateMenu(menu: ServerMenu, menus: ServerMenu[]) {
  const parent = menu.parentId ? findMenu(menus, menu.parentId) : undefined
  if (parent && parent.owner !== menu.owner) throw new Error(t('configuration.crossOwnerParent'))
  const original = findMenu(menus, menu.id)
  if (
    menu.parentId &&
    (menu.parentId === menu.id || (original && descendants(original).includes(menu.parentId)))
  )
    throw new Error(t('configuration.circularParent'))
  if (
    menu.parentId &&
    menuDepth(menus, menu.parentId) + 1 + treeDepth(original?.children || []) > 3
  )
    throw new Error(t('configuration.maximumDepth'))
}
export function buttonPermissions(buttons: MenuButton[]) {
  if (new Set(buttons.map((button) => button.id)).size !== buttons.length)
    throw new Error(t('configuration.duplicateButton'))
}
/** Change visibility and order without moving persisted menus between owners. */
export function settingsPayload(
  menus: ServerMenu[],
  selected: string[],
  parentId?: string,
): ServerMenu[] {
  if (parentId === undefined && treeDepth(menus) > 3)
    throw new Error(t('configuration.maximumDepth'))
  return menus.map((menu, index) => {
    const children = settingsPayload(menu.children || [], selected, menu.id)
    return {
      ...menu,
      parentId,
      sortIndex: menu.code === 'account-center' ? 9999 : index + 1,
      options: {
        ...menu.options,
        show:
          selected.includes(menu.code) ||
          children.some((child) => child.options?.show) ||
          ['system', 'system/Menu', 'account-center'].includes(menu.code),
      },
      children,
    }
  })
}
export function mergeMenuDefaults(menus: ServerMenu[], defaults: ServerMenu[]): ServerMenu[] {
  const output = cloneMenus(menus)
  const index = new Map<string, ServerMenu>()
  function register(rows: ServerMenu[]) {
    for (const row of rows) {
      index.set(row.code, row)
      register(row.children || [])
    }
  }
  register(output)
  function merge(rows: ServerMenu[], baseRows: ServerMenu[]) {
    for (const base of baseRows) {
      let current = index.get(base.code)
      if (!current) {
        current = { ...cloneMenus([base])[0]!, children: [] }
        rows.push(current)
        index.set(current.code, current)
      }
      current.buttons = [
        ...(current.buttons || []),
        ...(base.buttons || []).filter(
          (row) => !current.buttons?.some((button) => button.id === row.id),
        ),
      ]
      for (const button of current.buttons) {
        const defaultButton = base.buttons?.find((candidate) => candidate.id === button.id)
        if (defaultButton)
          button.permissions = mergePermissions(
            button.permissions || [],
            defaultButton.permissions || [],
          )
      }
      current.permissions = mergePermissions(current.permissions || [], base.permissions || [])
      current.children ||= []
      merge(current.children, base.children || [])
    }
  }
  merge(output, defaults)
  return output
}
/** Require one explicit owner before the destructive replacement API receives any request. */
export function menuReplacementOwner(value: unknown): string {
  if (!Array.isArray(value) || !value.length) throw new Error(t('configuration.invalidMenuOwner'))
  let owner: string | undefined
  function visit(rows: unknown[]) {
    for (const row of rows) {
      if (
        !isRecord(row) ||
        typeof row.owner !== 'string' ||
        !/^[A-Za-z0-9_.:-]{1,64}$/.test(row.owner)
      )
        throw new Error(t('configuration.invalidMenuOwner'))
      if (owner !== undefined && owner !== row.owner)
        throw new Error(t('configuration.mixedMenuOwners'))
      owner = row.owner
      if (row.children != null) {
        if (!Array.isArray(row.children)) throw new Error(t('common.invalid'))
        visit(row.children)
      }
    }
  }
  visit(value)
  return owner!
}

/** New template entries inherit the saved tree's owner; existing entities retain their metadata. */
export function synchronizeSystemMenus(menus: ServerMenu[], defaults: ServerMenu[]): ServerMenu[] {
  const owner = menus.length ? menuReplacementOwner(menus) : DEFAULT_MENU_OWNER
  const inheritOwner = (rows: ServerMenu[]): ServerMenu[] =>
    rows.map((row) => ({ ...row, owner, children: inheritOwner(row.children || []) }))
  const merged = mergeMenuDefaults(
    menus,
    inheritOwner(defaults.filter((menu) => menu.code === 'system')),
  )
  if (treeDepth(merged) > 3) throw new Error(t('configuration.maximumDepth'))
  return merged
}
function mergePermissions(
  current: ResourcePermission[],
  defaults: ResourcePermission[],
): ResourcePermission[] {
  const output = JSON.parse(JSON.stringify(current)) as ResourcePermission[]
  for (const permission of defaults) {
    const configured = output.find((row) => row.permission === permission.permission)
    if (configured)
      configured.actions = [...new Set([...configured.actions, ...permission.actions])]
    else output.push({ ...permission, actions: [...permission.actions] })
  }
  return output
}
