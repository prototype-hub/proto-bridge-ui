import type { Entity } from '@/modules/authentication-manager-ui/types/common'

export interface Permission extends Entity {
  actions?: { action: string; name: string }[]
}

export interface PermissionAction {
  action: string
  name: string
  describe?: string
  [key: string]: unknown
}
export interface PermissionResource extends Entity {
  status?: unknown
  describe?: string
  actions: PermissionAction[]
}
