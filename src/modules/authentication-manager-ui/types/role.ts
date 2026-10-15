import type { ServerMenu, MenuButton } from '@/shared/auth/types'
import type { Entity } from '@/modules/authentication-manager-ui/types/common'

export type Role = Entity

export interface AssetAccess {
  [key: string]: unknown
  supportId: string
  name: string
  granted?: boolean
}

export interface GrantMenu extends ServerMenu {
  buttons?: (MenuButton & { [key: string]: unknown })[]
  children?: GrantMenu[]
  assetAccesses?: AssetAccess[]
  accessDescription?: string
  indeterminate?: boolean
}
