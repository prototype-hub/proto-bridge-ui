import type { MenuEntryRegistry, RouteLoader } from '@/shared/router/menu-entry'

const pages = import.meta.glob<{ default: import('vue-router').RouteComponent }>(
  './views/**/index.vue',
)
export const componentMap: MenuEntryRegistry['componentMap'] = {}
export const componentAliases: MenuEntryRegistry['componentAliases'] = {
  Log: 'system/Log',
  'Log/Access': 'system/Log/Access',
  'Log/System': 'system/Log/System',
  'system/position': 'system/Positions',
}
export const menuPathMap: MenuEntryRegistry['menuPathMap'] = {}

for (const [file, loader] of Object.entries(pages)) {
  const match = file.match(/^\.\/views\/(\w+)(?:\/(access|system))?\/index\.vue$/)
  if (!match || ['account', 'auth'].includes(match[1]!)) continue
  const directory = match[1]!
  if (match[2] && directory !== 'logs') continue
  const name =
    directory === 'position'
      ? 'Positions'
      : directory === 'logs'
        ? 'Log'
        : directory[0]!.toUpperCase() + directory.slice(1)
  const suffix = match[2] ? `/${match[2][0]!.toUpperCase()}${match[2].slice(1)}` : ''
  const code = `system/${name}${suffix}`
  const component: RouteLoader = loader
  componentMap[code] = component
  const paths = match[2]
    ? [`/system/log/${match[2]}`, `/system/Log${suffix}`]
    : [`/system/${directory}`, `/system/${name}`]
  if (directory === 'position') paths.push('/system/positions')
  if (directory === 'logs' && !suffix) paths.push('/system/Log', '/system/log')
  if (directory === 'logs' && match[2]) {
    paths.push(`/logger/${match[2]}`, `/iotlinkLog/${match[2]}`, `/iotlinkLog${suffix}`)
  }
  for (const path of paths) menuPathMap[path] = { component, code }
}
for (const [alias, canonical] of Object.entries(componentAliases)) {
  const component = canonical && componentMap[canonical]
  if (component) componentMap[alias] = component
}
