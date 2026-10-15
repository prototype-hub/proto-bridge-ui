import { inject, type InjectionKey } from 'vue'
export interface PermissionProvider {
  can: (requested: string | string[]) => boolean
}
export const permissionKey: InjectionKey<PermissionProvider> = Symbol('permissions')
export const usePermissions = (): PermissionProvider => inject(permissionKey, { can: () => false })
