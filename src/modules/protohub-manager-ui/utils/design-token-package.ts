import type { DesignToken, DesignTokenDocument } from '../types/design-token-package'

export const designTokenByteLimit = 1048576
export const tokenPathKey = (path: string[]) => JSON.stringify(path)
export const tokenPathLabel = (path: string[]) => path.join(' / ')
export const tokenJson = (value: unknown) => JSON.stringify(value, null, 2) ?? 'null'
export const validDesignTokenFile = (file: File) =>
  /\.json$/i.test(file.name) &&
  file.name.length <= 255 &&
  file.size > 0 &&
  file.size <= designTokenByteLimit

/** Filter the complete bounded projection before slicing a visible result page. */
export function filterDesignTokens(
  document: DesignTokenDocument,
  query: { keyword: string; group: string; set: string; type: string },
): DesignToken[] {
  const group = document.groups.find((item) => tokenPathKey(item.path) === query.group)
  const set = document.sets.find((item) => item.name === query.set)
  const paths = set ? new Set(set.tokenPaths.map(tokenPathKey)) : undefined
  const keyword = query.keyword.trim().toLocaleLowerCase()
  return document.tokens.filter(
    (token) =>
      (!keyword ||
        `${token.name} ${token.path.join('/')} ${token.path.join('.')} ${token.type || ''}`
          .toLocaleLowerCase()
          .includes(keyword)) &&
      (!group || group.path.every((part, index) => token.path[index] === part)) &&
      (!paths || paths.has(tokenPathKey(token.path))) &&
      (query.type === '*' || (token.type || '') === query.type),
  )
}
