import type { MenuEntryRegistry } from '@/shared/router/menu-entry'
import type { Component } from 'vue'
import type { ReviewGrant } from '@/modules/protohub-manager-ui/api/review'
import type { ReviewContext, ReviewThread } from '@/modules/protohub-manager-ui/types'

/** Trusted shell scope for optional tools; never passed into the prototype iframe. */
export interface ReviewThreadToolContext {
  grant: ReviewGrant
  reviewContext: ReviewContext
  threadId: string
  accessMode?: ReviewThread['accessMode']
  disabled: boolean
}

/** Fixed revision and page scope passed to optional comparison tools. */
export interface ComparisonToolContext {
  projectId: string
  versionId: string
  leftRevisionId: string
  rightRevisionId: string
  leftPageId: string
  rightPageId: string
}

export interface ComparisonTool {
  key: string
  labelKey: string
  component: Component
}

/** Local build-time modules use the existing menu and locale boundaries; no runtime code is fetched. */
export interface ApplicationExtension extends Partial<MenuEntryRegistry> {
  locales?: { zh: Record<string, unknown>; en: Record<string, unknown> }
  /** Optional tools receive the current project and version; the basic build has no tools. */
  versionTools?: Component[]
  comparisonTools?: ComparisonTool[]
  /** Optional sign-in tools share the password form's serialized task and navigation. */
  loginTools?: Component[]
  reviewThreadTools?: Component[]
}

export function mergeExtensions(modules: Record<string, { default: ApplicationExtension }>) {
  const registry: MenuEntryRegistry = {
    componentMap: {},
    componentAliases: {},
    menuPathMap: {},
  }
  const locales: Required<ApplicationExtension>['locales'] = { zh: {}, en: {} }
  const versionTools: Component[] = []
  const comparisonTools: ComparisonTool[] = []
  const loginTools: Component[] = []
  const reviewThreadTools: Component[] = []
  for (const key of Object.keys(modules).sort()) {
    const extension = modules[key]!.default
    Object.assign(registry.componentMap, extension.componentMap)
    Object.assign(registry.componentAliases, extension.componentAliases)
    Object.assign(registry.menuPathMap, extension.menuPathMap)
    versionTools.push(...(extension.versionTools || []))
    comparisonTools.push(...(extension.comparisonTools || []))
    loginTools.push(...(extension.loginTools || []))
    reviewThreadTools.push(...(extension.reviewThreadTools || []))
    for (const language of ['zh', 'en'] as const)
      Object.assign(locales[language], extension.locales?.[language])
  }
  return { ...registry, locales, versionTools, comparisonTools, loginTools, reviewThreadTools }
}

export const extensions = mergeExtensions(
  import.meta.glob<{ default: ApplicationExtension }>('/src/extensions/*/index.ts', {
    eager: true,
  }),
)
