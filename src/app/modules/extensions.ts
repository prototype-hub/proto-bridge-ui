import type { MenuEntryRegistry } from '@/shared/router/menu-entry'

/** Local build-time modules use the existing menu and locale boundaries; no runtime code is fetched. */
export interface ApplicationExtension extends Partial<MenuEntryRegistry> {
  locales?: { zh: Record<string, unknown>; en: Record<string, unknown> }
}

export function mergeExtensions(modules: Record<string, { default: ApplicationExtension }>) {
  const registry: MenuEntryRegistry = {
    componentMap: {},
    componentAliases: {},
    menuPathMap: {},
  }
  const locales: Required<ApplicationExtension>['locales'] = { zh: {}, en: {} }
  for (const key of Object.keys(modules).sort()) {
    const extension = modules[key]!.default
    Object.assign(registry.componentMap, extension.componentMap)
    Object.assign(registry.componentAliases, extension.componentAliases)
    Object.assign(registry.menuPathMap, extension.menuPathMap)
    for (const language of ['zh', 'en'] as const)
      Object.assign(locales[language], extension.locales?.[language])
  }
  return { ...registry, locales }
}

export const extensions = mergeExtensions(
  import.meta.glob<{ default: ApplicationExtension }>('/src/extensions/*/index.ts', {
    eager: true,
  }),
)
