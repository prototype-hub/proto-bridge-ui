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
  /** -1 means no count limit; admission still comes from canCreate. */
  limit: number
  /** -1 when unlimited; otherwise the server-calculated available count. */
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
  visitTicket?: string | null
  reviewEnabled?: boolean
  reviewAvailable?: boolean
  reviewUnverifiedAllowed?: boolean
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
/** Current authorized stock and best-effort share opens; null never means zero. */
export interface PrototypeStatistics {
  timeZone: string
  fromDate: string
  toDate: string
  collectedSince: number
  retentionDays: number
  projectCount: number
  versionCount: number | null
  shareCount: number | null
  visits: number | null
  trend: { date: string; visits: number | null }[] | null
  ranking: { projectId: string; projectName: string; visits: number }[] | null
}
export interface ReviewPolicy {
  allowComment?: boolean
  enabled: boolean
  mailAvailable: boolean
  configVersion: number
  allowUnverified: boolean
}
export type ReviewVerificationLevel = 'email' | 'unverified'
export interface ReviewIdentity {
  guestId: string
  displayName: string
  company: string | null
  maskedEmail: string | null
  verificationLevel: ReviewVerificationLevel
  expiresAt: number
}
/** Management projection: mailbox and session credentials never leave the public identity boundary. */
export interface ReviewGuest {
  id: string
  displayName: string
  company: string | null
  maskedEmail: string | null
  verificationLevel: ReviewVerificationLevel
  expiresAt?: number | null
  enabled: boolean
  configVersion: number
  createTime: number
  modifyTime: number
}
export interface ReviewContext {
  allowComment?: boolean
  revisionId: string
  enabled: boolean
  mailAvailable: boolean
  allowUnverified: boolean
  csrfToken: string
  session: ReviewIdentity | null
}
export interface ReviewChallenge {
  challengeId: string
  expiresAt: number
  resendAfter: number
}
export type ReviewInvitationStatus = 'pending' | 'consumed' | 'revoked' | 'expired' | 'invalidated'
export interface ReviewInvitation {
  id: string
  maskedEmail: string
  status: ReviewInvitationStatus
  configVersion: number
  createdAt: number
  expiresAt: number
  consumedAt: number | null
}
export interface CreatedReviewInvitation {
  invitation: ReviewInvitation
  invitationToken: string
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

/** Validated shell selection; no runtime/session credentials belong to this event. */
export interface ReviewPage {
  revisionId: string
  pageId: string
  name: string
  path: string
}
/** A static root document position, never an element identity or an authorization grant. */
export interface ReviewAnchor {
  space: 'root-document-css-px-v1'
  shape: 'point' | 'rect' | 'ellipse'
  x: number
  y: number
  width: number
  height: number
  documentWidth: number
  documentHeight: number
  viewportWidth: number
  viewportHeight: number
}
export type ReviewThreadState = 'open' | 'resolved'
export interface ReviewThread {
  anchor?: ReviewAnchor | null
  id: string
  revisionId: string
  pageId: string
  pageName: string
  pagePath: string
  summary: string
  authorName: string
  authorCompany: string | null
  verificationLevel: ReviewVerificationLevel
  state: ReviewThreadState
  configVersion: number
  createdAt: number
  updatedAt: number
}
export interface ReviewMessage {
  id: string
  threadId: string
  text: string
  authorType: 'guest' | 'member'
  authorName: string | null
  authorCompany: string | null
  verificationLevel: ReviewVerificationLevel | null
  visibility: 'public' | 'internal'
  createdAt: number
  image: ReviewImage | null
}
export interface ReviewImage {
  contentType: 'image/png' | 'image/jpeg'
  size: number
  width: number
  height: number
}
export interface ReviewThreadPage {
  revisionId: string
  pageId: string
}
export interface ReviewThreadQuery extends ReviewThreadPage {
  pageIndex: number
  pageSize: number
  state?: ReviewThreadState
}
/** Revision overview deliberately has no page grant or page-specific write fields. */
export interface ReviewThreadOverviewQuery {
  revisionId: string
  pageIndex: number
  pageSize: number
  state?: ReviewThreadState
}
export interface ReviewMemberThreadOverviewQuery extends ReviewThreadOverviewQuery {
  assignment?: 'mine' | 'unassigned' | null
}
export interface ReviewMessageInput extends ReviewThreadPage {
  text: string
  clientRequestId: string
}
export interface ReviewCreateInput extends ReviewMessageInput {
  anchor?: ReviewAnchor | null
}
export interface ReviewStatusInput extends ReviewThreadPage {
  state: ReviewThreadState
  expectedVersion: number
  clientRequestId: string
}
/** Internal assignment is deliberately separate from the visitor-visible thread/state version. */
export interface ReviewAssignment {
  threadId: string
  assignmentVersion: number
  updatedAt: number | null
  assignee: { userId: string; name: string; available: boolean } | null
}
export interface ReviewAssignee {
  userId: string
  name: string
}
export interface ReviewAssignmentInput extends ReviewThreadPage {
  assigneeId: string | null
  expectedVersion: number
  clientRequestId: string
}

/** A member-owned link attached to one immutable revision and its canonical page. */
export interface WorkItem {
  id: string
  projectId: string
  versionId: string
  revisionId: string
  pageId: string
  url: string
  note: string
  configVersion: number
  createdAt: number
  updatedAt: number
}
export interface WorkItemQuery {
  revisionId: string
  pageId: string
  pageIndex: number
  pageSize: number
}
export interface WorkItemInput {
  revisionId: string
  pageId: string
  url: string
  note: string
  clientRequestId: string
}
export interface WorkItemDeleteInput {
  revisionId: string
  pageId: string
  expectedVersion: number
  clientRequestId: string
}
