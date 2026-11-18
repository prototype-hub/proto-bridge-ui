import { previewIdentity } from './preview-location'
import type { PrototypeSearchResult, SearchScope } from '../types/search'

/** Only opaque scope IDs and a controlled tool marker may enter a source URL. */
export function searchScope(query: Record<string, unknown>): SearchScope | null {
  const result: SearchScope = {}
  for (const key of ['projectId', 'versionId', 'revisionId'] as const) {
    const value = previewIdentity(query[key])
    if (value === null || (value !== undefined && !/^[A-Za-z0-9_-]{1,64}$/.test(value))) return null
    if (value !== undefined) result[key] = value
  }
  return result
}
export function searchSourceLocation(row: PrototypeSearchResult) {
  return {
    name: 'PrototypeHub-preview-window',
    params: { projectId: row.projectId, versionId: row.versionId },
    query: {
      revisionId: row.revisionId,
      ...(row.type === 'MATERIAL'
        ? { tool: 'materials', materialId: row.sourceId }
        : {
            pageId: row.pageId!,
            ...(row.type === 'FEEDBACK' ? { threadId: row.threadId! } : { tool: 'copy' }),
          }),
    },
  }
}
export function searchTool(
  query: Record<string, unknown>,
): 'copy' | 'materials' | null | undefined {
  if (query.tool === undefined) return query.materialId === undefined ? undefined : null
  if (query.threadId !== undefined) return null
  if (query.tool !== 'copy' && query.tool !== 'materials') return null
  if (!searchScope({ revisionId: query.revisionId })?.revisionId) return null
  if (query.tool === 'copy' && !searchScope({ revisionId: query.pageId })?.revisionId) return null
  if (
    query.materialId !== undefined &&
    (query.tool !== 'materials' || !searchScope({ revisionId: query.materialId })?.revisionId)
  )
    return null
  return query.tool
}
/** Escape-free Vue text nodes carry untrusted snippets; highlighting never renders HTML. */
export function searchHighlights(text: string, keyword: string) {
  if (!keyword) return [{ text, match: false }]
  const expression = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
  const result: { text: string; match: boolean }[] = []
  let start = 0
  for (const match of text.matchAll(expression)) {
    const at = match.index
    if (at > start) result.push({ text: text.slice(start, at), match: false })
    result.push({ text: match[0], match: true })
    start = at + match[0].length
  }
  if (start < text.length) result.push({ text: text.slice(start), match: false })
  return result
}
