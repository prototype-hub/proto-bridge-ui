import type { ProjectOrganizationDraft } from '../types'

// Match the server's Unicode whitespace boundary without folding case or compatibility characters.
export const trimProjectLabel = (value: string) =>
  // eslint-disable-next-line no-control-regex -- Java treats U001C..U001F as whitespace.
  value.replace(/^[\s\u001C-\u001F]+|[\s\u001C-\u001F]+$/gu, '')

export function normalizeOrganization(draft: ProjectOrganizationDraft): ProjectOrganizationDraft {
  return {
    groupName: trimProjectLabel(draft.groupName),
    tags: [...new Set(draft.tags.map(trimProjectLabel).filter(Boolean))].sort(),
    archived: draft.archived,
  }
}
export function validOrganization(draft: ProjectOrganizationDraft) {
  const value = normalizeOrganization(draft)
  return (
    draft.tags.length <= 10 &&
    value.groupName.length <= 64 &&
    !value.groupName.includes('\0') &&
    value.tags.length <= 10 &&
    value.tags.every((tag) => tag.length <= 32 && !tag.includes('\0'))
  )
}

/** Images never receive the API client or its authorization headers. */
export function safeProjectCover(value: string | undefined, origin = window.location.origin) {
  // eslint-disable-next-line no-control-regex -- Reject control characters before URL parsing.
  if (!value || value.length > 1024 || /[\u0000-\u0020\u007f\\]/u.test(value)) return undefined
  try {
    const url = new URL(value, origin)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      return undefined
    // Protocol-relative URLs obscure the destination and are not relative application paths.
    if (value.startsWith('//')) return undefined
    return url.href
  } catch {
    return undefined
  }
}
