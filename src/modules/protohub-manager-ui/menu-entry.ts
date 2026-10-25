import type { MenuEntryRegistry } from '@/shared/router/menu-entry'
import { resolveRegisteredMenuComponent } from '@/shared/router/menu-entry'
import type { ServerMenu } from '@/shared/auth/types'

export const projectComponentCode = 'prototype-hub/Project'
export const recycleComponentCode = 'prototype-hub/Recycle'
export const projectMenuPaths = [
  '/prototype-hub',
  '/prototype-hub/projects',
  '/protohub',
  '/protohub/projects',
  '/PrototypeHub',
  '/PrototypeHub/projects',
] as const
const pages = import.meta.glob<{ default: import('vue-router').RouteComponent }>(
  './views/**/index.vue',
)
export const componentMap: MenuEntryRegistry['componentMap'] = {}
export const componentAliases: MenuEntryRegistry['componentAliases'] = {
  'protohub/Project': projectComponentCode,
  'PrototypeHub/Project': projectComponentCode,
}
export const menuPathMap: MenuEntryRegistry['menuPathMap'] = {}
// Detail, preview and public-share entries have independent route and permission boundaries.
for (const [file, component] of Object.entries(pages)) {
  const match = file.match(/^\.\/views\/(\w+)\/index\.vue$/)
  if (!match || ['account', 'auth', 'preview', 'share', 'detail'].includes(match[1]!)) continue
  const directory = match[1]!
  const code = `prototype-hub/${directory[0]!.toUpperCase()}${directory.slice(1)}`
  componentMap[code] = component
  const paths =
    directory === 'project'
      ? projectMenuPaths
      : directory === 'recycle'
        ? ['/prototype-hub/recycle-bin']
        : [`/prototype-hub/${directory}`]
  for (const path of paths) menuPathMap[path] = { component, code }
}
for (const [alias, canonical] of Object.entries(componentAliases)) {
  const component = canonical && componentMap[canonical]
  if (component) componentMap[alias] = component
}
export function resolveProjectMenuComponent(menu: ServerMenu, path: string) {
  return resolveRegisteredMenuComponent(menu, path, { componentMap, componentAliases, menuPathMap })
}
