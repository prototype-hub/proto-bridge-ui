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
import { extensions } from './extensions'
export const componentMap = {
  ...authComponents,
  ...protoComponents,
  ...extensions.componentMap,
}
export const componentAliases = { ...authAliases, ...protoAliases, ...extensions.componentAliases }
export const menuPathMap = { ...authPaths, ...protoPaths, ...extensions.menuPathMap }
export function resolveMenuComponent(menu: ServerMenu, path: string) {
  return resolveRegisteredMenuComponent(menu, path, { componentMap, componentAliases, menuPathMap })
}
