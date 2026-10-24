/** Typed list queries deliberately exclude arbitrary ORM terms and column expressions. */
export interface PrototypeListQuery {
  pageIndex?: number
  pageSize?: number
  keyword?: string
  sortBy?: 'createTime' | 'name'
  sortOrder?: 'asc' | 'desc'
}
export type PrototypeListSort = 'createTime:desc' | 'createTime:asc' | 'name:asc' | 'name:desc'

export interface Project {
  deletedTime?: number | null
  id: string
  name: string
  description?: string
  cover?: string
  createdBy: string
  createdAt: number
  updatedAt: number
  ownerId: string | null
  role: 'owner' | 'editor' | 'viewer' | 'admin'
  claimRequired: boolean
  capabilities: ProjectCapabilities
}
/** Server-owned project scope; visible controls also require their ordinary action permission. */
export interface ProjectCapabilities {
  read: boolean
  edit: boolean
  manageMembers: boolean
  deleteProject: boolean
  manageShares: boolean
}
export interface ProjectMember {
  userId: string
  name: string
  username: string
  role: 'owner' | 'editor' | 'viewer'
}
export interface MemberCandidate {
  userId: string
  name: string
  username: string
}
export interface OwnershipMigration {
  scanned: number
  assigned: number
  pending: number
  unchanged: number
}
export interface ProjectInput {
  name: string
  description?: string
  cover?: string
}
export interface Capacity {
  used: number
  limit: number
  remaining: number
  overLimit: boolean
  canCreate: boolean
}
export interface ProjectUsage {
  installationId: string
  projects: Capacity
}
export interface VersionUsage {
  projectId: string
  versions: Capacity
}
export interface Version {
  deletedTime?: number | null
  id: string
  projectId: string
  versionName: string
  description?: string
  entryFile: string
  status: 'ready' | 'failed'
  createdBy: string
  createdAt: number
  runtimeBaseUrl: string | null
  previewUrl: string | null
  currentRevisionId: string | null
  revisionId: string | null
  revisionCount: number
  migrationRequired: boolean
}
export interface Revision {
  id: string
  projectId: string
  versionId: string
  versionName: string
  description?: string
  entryFile: string
  manifestSha256: string
  fileCount: number
  totalBytes: number
  createdBy: string
  createdAt: number
}
export type QualityFindingCode =
  | 'entry_missing'
  | 'file_missing'
  | 'missing_resource'
  | 'broken_internal_link'
  | 'chinese_path'
  | 'text_unreadable'
  | 'document_limit'
  | 'reference_limit'
  | 'findings_limit'
  | 'invalid_reference'
export interface QualityFinding {
  code: QualityFindingCode
  severity: 'error' | 'warning'
  sourcePath: string
  targetPath: string | null
  reference: string | null
}
/** A bounded static check of one persisted revision, independent of the current pointer. */
export interface RevisionQuality {
  versionId: string
  revisionId: string
  manifestSha256: string
  entryFile: string
  summary: {
    files: number
    scannedDocuments: number
    scannedBytes: number
    checkedReferences: number
    errors: number
    warnings: number
    findingsTotal: number
    omittedFindings: number
    skippedDocuments: number
    uncheckedReferences: {
      external: number
      rootAbsolute: number
      fragment: number
      unsupportedScheme: number
    }
  }
  limits: {
    maxTextBytes: number
    maxTotalTextBytes: number
    maxReferences: number
    maxFindings: number
  }
  complete: boolean
  findings: QualityFinding[]
}
export interface PreviewSession {
  runtimeBaseUrl: string
  previewUrl: string
  expiresAt: number
}
export type ComparisonStatus = 'added' | 'removed' | 'changed' | 'unchanged'
export type ComparisonCounts = Record<ComparisonStatus, number>
export interface ComparisonPage {
  path: string
  status: ComparisonStatus
  left: { pageId: string | null; name: string; path: string } | null
  right: { pageId: string | null; name: string; path: string } | null
}
export interface ComparisonFile {
  path: string
  status: ComparisonStatus
  left: { size: number; sha256: string; mediaType: string } | null
  right: { size: number; sha256: string; mediaType: string } | null
}
export interface RevisionComparison {
  versionId: string
  left: Revision
  right: Revision
  summary: { pages: ComparisonCounts; files: ComparisonCounts }
  pages: import('@/shared/api/types').PageResult<ComparisonPage>
  files: import('@/shared/api/types').PageResult<ComparisonFile>
}
export interface ComparisonQuery {
  leftRevisionId: string
  rightRevisionId: string
  pagesPageIndex: number
  pagesPageSize: number
  filesPageIndex: number
  filesPageSize: number
  includeUnchanged: boolean
}
export type WorkspacePane = 'left' | 'right'
export interface PrototypePage {
  name: string
  pageId?: string | null
  path?: string
  folder?: boolean
  children?: PrototypePage[]
}
export type ShareRevisionMode = 'fixed' | 'latest'
export type SharePasswordAction = 'keep' | 'replace' | 'remove'
export interface ShareInput {
  description?: string | null
  password?: string
  expiresAt?: number | null
  revisionMode?: ShareRevisionMode
  revisionId?: string
}
export interface ShareUpdate extends ShareInput {
  expectedVersion: number
  revisionMode: ShareRevisionMode
  passwordAction: SharePasswordAction
}
export interface Share {
  revisionMode: ShareRevisionMode
  revisionId: string | null
  revoked: boolean
  configVersion: number
  id: string
  projectId: string
  versionId: string
  token: string
  description?: string | null
  passwordRequired: boolean
  expiresAt?: number | null
  enabled: boolean
  createdAt: number
  sharePath: string
}
export interface PublicShare {
  reviewEnabled?: boolean
  reviewAvailable?: boolean
  revisionMode: ShareRevisionMode
  pagesUrl?: string
  token: string
  revisionId: string
  projectName: string
  versionName: string
  passwordRequired: boolean
  expiresAt?: number
  accessKey?: string
  runtimeBaseUrl?: string
  previewUrl?: string
}
export interface ReviewPolicy {
  enabled: boolean
  mailAvailable: boolean
  configVersion: number
}
export interface ReviewIdentity {
  guestId: string
  displayName: string
  company: string | null
  maskedEmail: string
  verificationLevel: 'email'
  expiresAt: number
}
export interface ReviewContext {
  revisionId: string
  enabled: boolean
  mailAvailable: boolean
  csrfToken: string
  session: ReviewIdentity | null
}
export interface ReviewChallenge {
  challengeId: string
  expiresAt: number
  resendAfter: number
}
export interface InspectAsset {
  type: 'image' | 'svg'
  url?: string
  content?: string
}
export interface InspectElement {
  tagName: string
  id: string
  className: string
  text: string
  position: { x: number; y: number; pageX: number; pageY: number }
  size: { width: number; height: number }
  typography: Record<string, string>
  appearance: Record<string, string>
  spacing: Record<string, string>
  html: string
  assets: InspectAsset[]
}
export interface WorkspaceContext {
  /** Immutable identity authorized for this workspace; legacy standalone contexts may omit it. */
  revisionId?: string
  /** App path captured with the authorized context to prevent stale canonical navigation. */
  locationPath?: string
  title: string
  versionName: string
  runtimeBaseUrl: string
  entryFile: string
  pages: PrototypePage[]
}
export interface UploadContext {
  projectId: string
  version?: Version
}
