import {
  componentMap as authComponents,
  componentAliases as authAliases,
  menuPathMap as authPaths,
} from '@/modules/authentication-manager-ui'
import {
  componentMap as protoComponents,
  componentAliases as protoAliases,
  menuPathMap as protoPaths,
} from '@/modules/protohub-manager-ui'
import type { ServerMenu } from '@/shared/auth/types'
import { resolveRegisteredMenuComponent } from '@/shared/router/menu-entry'
export const componentMap = {
  ...authComponents,
  ...protoComponents,
}
export const componentAliases = { ...authAliases, ...protoAliases }
export const menuPathMap = { ...authPaths, ...protoPaths }
export function resolveMenuComponent(menu: ServerMenu, path: string) {
  return resolveRegisteredMenuComponent(menu, path, { componentMap, componentAliases, menuPathMap })
}
