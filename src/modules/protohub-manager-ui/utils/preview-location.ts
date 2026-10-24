import type { PrototypePage } from '../types'
import { runtimePageUrl } from './urls'

/** Route identities are single opaque values; duplicate keys and blank/control values are invalid. */
export function previewIdentity(value: unknown): string | undefined | null {
  if (value === undefined) return undefined
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    ? value
    : null
}
export function flattenPages(pages: PrototypePage[]): PrototypePage[] {
  return pages.flatMap((page) => [page, ...flattenPages(page.children || [])])
}
export function selectablePage(page: PrototypePage, runtimeBaseUrl: string): boolean {
  if (page.folder === true || !page.path) return false
  try {
    runtimePageUrl(runtimeBaseUrl, page.path)
    return true
  } catch {
    return false
  }
}
/** Never manufacture an ID for legacy pages or choose arbitrarily between duplicate manifest IDs. */
export function stablePageId(page: PrototypePage, pages: PrototypePage[]): string | undefined {
  const id = previewIdentity(page.pageId)
  return id && flattenPages(pages).filter((item) => item.pageId === id).length === 1
    ? id
    : undefined
}
export function resolvePreviewPage(
  pages: PrototypePage[],
  runtimeBaseUrl: string,
  target: unknown,
) {
  const id = previewIdentity(target)
  const all = flattenPages(pages)
  if (id === null) return { invalid: true } as const
  if (id !== undefined) {
    const matches = all.filter((page) => page.pageId === id)
    if (matches.length !== 1 || !selectablePage(matches[0], runtimeBaseUrl))
      return { invalid: true } as const
    return { invalid: false, page: matches[0] } as const
  }
  return { invalid: false, page: all.find((page) => selectablePage(page, runtimeBaseUrl)) } as const
}
