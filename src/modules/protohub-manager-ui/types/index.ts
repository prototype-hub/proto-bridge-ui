export interface Project {
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
export interface PreviewSession {
  runtimeBaseUrl: string
  previewUrl: string
  expiresAt: number
}
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
