import type { MenuEntryRegistry } from '@/shared/router/menu-entry'
import type { Component } from 'vue'

/** Local build-time modules use the existing menu and locale boundaries; no runtime code is fetched. */
export interface ApplicationExtension extends Partial<MenuEntryRegistry> {
  locales?: { zh: Record<string, unknown>; en: Record<string, unknown> }
  /** Optional tools receive the current project and version; the basic build has no tools. */
  versionTools?: Component[]
}

export function mergeExtensions(modules: Record<string, { default: ApplicationExtension }>) {
  const registry: MenuEntryRegistry = {
    componentMap: {},
    componentAliases: {},
    menuPathMap: {},
  }
  const locales: Required<ApplicationExtension>['locales'] = { zh: {}, en: {} }
  const versionTools: Component[] = []
  for (const key of Object.keys(modules).sort()) {
    const extension = modules[key]!.default
    Object.assign(registry.componentMap, extension.componentMap)
    Object.assign(registry.componentAliases, extension.componentAliases)
    Object.assign(registry.menuPathMap, extension.menuPathMap)
    versionTools.push(...(extension.versionTools || []))
    for (const language of ['zh', 'en'] as const)
      Object.assign(locales[language], extension.locales?.[language])
  }
  return { ...registry, locales, versionTools }
}

export const extensions = mergeExtensions(
  import.meta.glob<{ default: ApplicationExtension }>('/src/extensions/*/index.ts', {
    eager: true,
  }),
)
