import type { Router } from 'vue-router'
export const applicationUrl = (
  router: Pick<Router, 'resolve'>,
  path: string,
  origin = window.location.origin,
) => origin + router.resolve(path).href
export function runtimePageUrl(
  base: string,
  path: string,
  origin = window.location.origin,
): string {
  const baseUrl = new URL(base.replace(/\/$/, '') + '/', origin)
  if (
    baseUrl.origin !== origin ||
    !['http:', 'https:'].includes(baseUrl.protocol) ||
    baseUrl.username ||
    baseUrl.password
  )
    throw new Error('Invalid runtime origin')
  // A leading slash can escape the runtime prefix or turn into a protocol-relative external URL.
  if (!path || path.startsWith('/')) throw new Error('Invalid runtime path')
  const parts = path.split('/')
  if (
    parts.some((part) => {
      // The server supplies a raw filename: '%' is legal and must not be URI-decoded here.
      // Inspect escape bytes only for the existing traversal/control checks, then encode the raw segment.
      const value = part.replace(/%([\da-f]{2})/gi, (_match, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      )
      return (
        ['.', '..'].includes(value) || [...value].some((c) => c === '\\' || c.charCodeAt(0) < 32)
      )
    })
  )
    throw new Error('Invalid runtime path')
  return new URL(parts.map(encodeURIComponent).join('/'), baseUrl).href
}
export function entryFromUrls(base: string, preview: string): string {
  const prefix = base.replace(/\/$/, '') + '/'
  if (!preview.startsWith(prefix)) throw new Error('Invalid preview path')
  return preview
    .slice(prefix.length)
    .split('/')
    .map((part) => decodeURIComponent(part))
    .join('/')
}
