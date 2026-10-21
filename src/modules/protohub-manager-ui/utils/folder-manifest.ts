/** Browser packaging budgets protect local memory; the server still enforces its own upload rules. */
export const FOLDER_LIMITS = {
  maxFiles: 5000,
  maxTotalBytes: 128 * 1024 * 1024,
  maxFileBytes: 64 * 1024 * 1024,
} as const

export type FolderArchiveErrorCode =
  | 'empty'
  | 'invalidPath'
  | 'tooManyFiles'
  | 'tooLarge'
  | 'noHtml'
  | 'unsupported'
  | 'failed'

/** Structured failures let the caller translate messages without exposing worker internals. */
export class FolderArchiveError extends Error {
  constructor(public readonly code: FolderArchiveErrorCode) {
    super(code)
    this.name = 'FolderArchiveError'
  }
}

export interface FolderManifestEntry {
  path: string
  file: File
}

export interface FolderManifest {
  entries: FolderManifestEntry[]
  rootName: string
  totalBytes: number
}

/** Reject malformed UTF-16 instead of silently replacing filename bytes during ZIP encoding. */
function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
    } else if (code >= 0xdc00 && code <= 0xdfff) return true
  }
  return false
}

/** Match the existing extractor's six-level HTML entry search, without selecting a new entry policy. */
function isEntryCandidate(path: string): boolean {
  const parts = path.split('/')
  return parts.length <= 6 && /\.html?$/i.test(path) && !/(?:resources|data|plugins)\//i.test(path)
}

/**
 * Validate all selected files before reading bytes. Strip exactly the selected outer directory,
 * never skip hidden/invalid files: a partial export could upload successfully with missing resources.
 */
export function buildFolderManifest(files: readonly File[]): FolderManifest {
  if (!files.length) throw new FolderArchiveError('empty')
  if (files.length > FOLDER_LIMITS.maxFiles) throw new FolderArchiveError('tooManyFiles')
  if (files.every((file) => !file.webkitRelativePath)) throw new FolderArchiveError('unsupported')

  const entries: FolderManifestEntry[] = []
  const paths = new Set<string>()
  const directories = new Set<string>()
  const encoder = new TextEncoder()
  let rootName: string | undefined
  let totalBytes = 0
  let hasEntry = false
  for (const file of files) {
    const relative = file.webkitRelativePath
    if (
      !relative ||
      /[\\:]/.test(relative) ||
      [...relative].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      hasUnpairedSurrogate(relative) ||
      encoder.encode(relative).length > 4096
    )
      throw new FolderArchiveError('invalidPath')
    const parts = relative.split('/')
    if (
      parts.length < 2 ||
      parts.some((part) => !part || part.startsWith('.')) ||
      parts[parts.length - 1] !== file.name
    )
      throw new FolderArchiveError('invalidPath')
    rootName ??= parts[0]
    if (parts[0] !== rootName) throw new FolderArchiveError('invalidPath')

    const path = parts.slice(1).join('/')
    if (paths.has(path) || directories.has(path)) throw new FolderArchiveError('invalidPath')
    for (let index = 1; index < parts.length - 1; index++) {
      const parent = parts.slice(1, index + 1).join('/')
      if (paths.has(parent)) throw new FolderArchiveError('invalidPath')
      directories.add(parent)
    }
    paths.add(path)
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > FOLDER_LIMITS.maxFileBytes)
      throw new FolderArchiveError('tooLarge')
    totalBytes += file.size
    if (totalBytes > FOLDER_LIMITS.maxTotalBytes) throw new FolderArchiveError('tooLarge')
    hasEntry ||= isEntryCandidate(path)
    entries.push({ path, file })
  }
  if (!hasEntry) throw new FolderArchiveError('noHtml')
  // Use code-unit order, not the user's locale or directory enumeration order, for stable ZIP bytes.
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
  return { entries, rootName: rootName!, totalBytes }
}
