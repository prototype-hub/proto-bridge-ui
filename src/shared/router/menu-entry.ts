import type { RouteComponent } from 'vue-router'
import type { ServerMenu } from '@/shared/auth/types'

export type RouteLoader = () => Promise<{ default: RouteComponent }>
export interface MenuComponentEntry {
  component: RouteLoader
  code: string
}
export interface MenuEntryRegistry {
  componentMap: Partial<Record<string, RouteLoader>>
  componentAliases: Partial<Record<string, string>>
  menuPathMap: Partial<Record<string, MenuComponentEntry>>
}

function normalizedCode(code: string) {
  const value = code.replace(/\/index$/i, '')
  const match = value.match(/^(system|prototype-hub|prototypehub|protohub)\/(.+)$/i)
  if (!match) return value
  const namespace = match[1]!.toLowerCase() === 'system' ? 'system' : 'prototype-hub'
  return `${namespace}/${match[2]!.toLowerCase()}`
}

/** Resolve only codes found in the build-time module registry, including its declared aliases. */
export function resolveMenuEntryCode(
  code: string | undefined,
  registry: MenuEntryRegistry,
): MenuComponentEntry | undefined {
  if (!code) return undefined
  const normalized = normalizedCode(code)
  const alias = Object.keys(registry.componentAliases).find(
    (key) => normalizedCode(key) === normalized,
  )
  const canonical = alias
    ? registry.componentAliases[alias]
    : Object.keys(registry.componentMap).find((key) => normalizedCode(key) === normalized)
  const component = canonical && registry.componentMap[canonical]
  return component && canonical ? { component, code: canonical } : undefined
}

function normalizedPath(path: string) {
  return path
    .replace(/^\/(?:prototype-hub|prototypehub|protohub)(?=\/|$)/i, '/prototype-hub')
    .replace(/\/$/, '')
}

export function isSafeMenuPath(path: string) {
  return (
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !/[?#]|\.\./.test(path) &&
    !['/', '/login', '/share', '/preview', '/403', '/404'].includes(path) &&
    !/^\/(?:login|user\/login|relogin)\/?$/i.test(path) &&
    !/^\/oauth(?:\/|$)/i.test(path) &&
    !/^\/edge\/token\/[^/]+\/?$/i.test(path) &&
    !/^\/(?:share|preview)\//.test(path) &&
    !/^\/account(?:\/|$)/.test(path) &&
    !/^\/(?:prototype-hub|prototypehub|protohub)\/(?:share|preview)(?:\/|$)/i.test(path) &&
    !/^\/(?:prototype-hub|prototypehub|protohub)\/projects\/[^/]+\/?$/i.test(path) &&
    !/^\/(?:prototype-hub|prototypehub|protohub)\/projects\/[^/]+\/versions\/[^/]+\/?$/i.test(path)
  )
}

export function resolveRegisteredMenuComponent(
  menu: ServerMenu,
  path: string,
  registry: MenuEntryRegistry,
): MenuComponentEntry | undefined {
  if (!isSafeMenuPath(path)) return undefined
  const byCode = resolveMenuEntryCode(menu.code, registry)
  if (byCode) return byCode
  // Module directories must not acquire a page merely because their URL matches a child page.
  if (!/^(?:system|prototype-hub|prototypehub|protohub)$/i.test(menu.code)) {
    const key = Object.keys(registry.menuPathMap).find(
      (candidate) => normalizedPath(candidate) === normalizedPath(path),
    )
    if (key) return registry.menuPathMap[key]
  }
  return (
    resolveMenuEntryCode(menu.componentCode, registry) ||
    resolveMenuEntryCode(menu.options?.meta?.componentCode, registry)
  )
}
