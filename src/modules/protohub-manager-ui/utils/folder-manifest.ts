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

export type FolderPathIssueReason =
  | 'missingRelativePath'
  | 'invalidCharacters'
  | 'invalidUnicode'
  | 'pathTooLong'
  | 'absolutePath'
  | 'emptySegment'
  | 'traversal'
  | 'hiddenEntry'
  | 'nameMismatch'
  | 'mixedRoots'
  | 'duplicate'
  | 'fileDirectoryConflict'

export interface FolderPathIssue {
  path: string
  reason: FolderPathIssueReason
  conflictingPath?: string
}

/** Structured failures let the caller translate messages without exposing worker internals. */
export class FolderArchiveError extends Error {
  constructor(
    public readonly code: FolderArchiveErrorCode,
    public readonly issues: readonly FolderPathIssue[] = [],
    public readonly totalIssueCount = issues.length,
  ) {
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

/** The selected root is stripped, so only inner names must follow the extractor's hidden-file rule. */
function pathIssue(file: File, encoder: TextEncoder): FolderPathIssueReason | undefined {
  const relative = file.webkitRelativePath
  if (!relative || !relative.includes('/')) return 'missingRelativePath'
  if (relative.startsWith('/') || /^[a-z]:[\\/]/i.test(relative)) return 'absolutePath'
  if (
    /[\\:]/.test(relative) ||
    [...relative].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return 'invalidCharacters'
  if (hasUnpairedSurrogate(relative)) return 'invalidUnicode'
  if (encoder.encode(relative).length > 4096) return 'pathTooLong'
  const parts = relative.split('/')
  if (parts.some((part) => !part)) return 'emptySegment'
  if (parts.some((part) => part === '.' || part === '..')) return 'traversal'
  if (parts.slice(1).some((part) => part.startsWith('.'))) return 'hiddenEntry'
  if (parts.at(-1) !== file.name) return 'nameMismatch'
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
  const paths = new Map<string, string>()
  const directories = new Map<string, string>()
  const issues: FolderPathIssue[] = []
  let totalIssueCount = 0
  // Keep the complete count without flooding the dialog with a large invalid export.
  const addIssue = (issue: FolderPathIssue) => {
    totalIssueCount++
    if (issues.length < 20) issues.push(issue)
  }
  const encoder = new TextEncoder()
  let rootName: string | undefined
  let totalBytes = 0
  let tooLarge = false
  let hasEntry = false
  for (const file of files) {
    const relative = file.webkitRelativePath
    const reason = pathIssue(file, encoder)
    if (reason) {
      addIssue({ path: relative || file.name, reason })
      continue
    }
    const parts = relative.split('/')
    rootName ??= parts[0]
    if (parts[0] !== rootName) {
      addIssue({ path: relative, reason: 'mixedRoots' })
      continue
    }

    const path = parts.slice(1).join('/')
    const conflictingPath = paths.get(path) ?? directories.get(path)
    if (conflictingPath !== undefined) {
      addIssue({
        path: relative,
        reason: paths.has(path) ? 'duplicate' : 'fileDirectoryConflict',
        conflictingPath,
      })
      continue
    }
    const parents = parts.slice(1, -1).map((_, index) => parts.slice(1, index + 2).join('/'))
    const parentFile = parents.find((parent) => paths.has(parent))
    if (parentFile !== undefined) {
      addIssue({
        path: relative,
        reason: 'fileDirectoryConflict',
        conflictingPath: paths.get(parentFile),
      })
      continue
    }
    parents.forEach((parent) => {
      if (!directories.has(parent)) directories.set(parent, relative)
    })
    paths.set(path, relative)
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > FOLDER_LIMITS.maxFileBytes)
      tooLarge = true
    totalBytes += file.size
    if (totalBytes > FOLDER_LIMITS.maxTotalBytes) tooLarge = true
    hasEntry ||= isEntryCandidate(path)
    entries.push({ path, file })
  }
  if (totalIssueCount) throw new FolderArchiveError('invalidPath', issues, totalIssueCount)
  if (tooLarge) throw new FolderArchiveError('tooLarge')
  if (!hasEntry) throw new FolderArchiveError('noHtml')
  // Use code-unit order, not the user's locale or directory enumeration order, for stable ZIP bytes.
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
  return { entries, rootName: rootName!, totalBytes }
}
