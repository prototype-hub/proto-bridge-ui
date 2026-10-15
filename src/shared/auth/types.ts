export interface MenuButton {
  id: string
  name: string
  granted?: boolean
  description?: string
  permissions?: ResourcePermission[]
  i18nName?: string
}
export interface ResourcePermission {
  id?: string
  permission?: string
  actions: string[]
}
export interface ServerMenu {
  [key: string]: unknown
  id: string
  code: string
  name: string
  icon?: string
  url?: string
  appId?: string
  owner?: string
  accessSupport?:
    | { value: 'unsupported' | 'support' | 'indirect'; label?: string }
    | 'unsupported'
    | 'support'
    | 'indirect'
  assetType?: string
  indirectMenus?: string[]
  describe?: string
  createTime?: number
  level?: number
  componentCode?: string
  parentId?: string
  sortIndex?: number
  granted?: boolean
  buttons?: MenuButton[]
  children?: ServerMenu[]
  permissions?: ResourcePermission[]
  i18nMessages?: { name?: Record<string, string> }
  options?: { show?: boolean; meta?: { componentCode?: string } }
}
export interface User {
  id: string
  username: string
  name: string
  status?: number | string
  email?: string
  telephone?: string
  avatar?: string
  roleList?: { id: string; name: string }[]
}
export interface Authorization {
  permissions?: ResourcePermission[]
}
