export type ApprovalAction = 'approve' | 'revoke' | 'publish' | 'withdraw'
export interface ApprovalDecision {
  id: string
  action: ApprovalAction
  actorId: string
  actorName: string
  createTime: number
  note: string
}
export interface RevisionApproval {
  projectId: string
  versionId: string
  revisionId: string
  configVersion: number
  approved: boolean
  published: boolean
  approval: ApprovalDecision | null
  publication: ApprovalDecision | null
  revision: {
    versionName: string
    description?: string
    entryFile: string
    manifestSha256: string
    fileCount: number
    totalBytes: number
    createTime: number
  }
}
export interface ApprovalEvent extends ApprovalDecision {
  projectId: string
  versionId: string
  revisionId: string
  configVersion: number
  approved: boolean
  published: boolean
  approvalId: string | null
  publicationId: string | null
}
export interface ApprovalInput {
  action: ApprovalAction
  expectedVersion: number
  clientRequestId: string
  note: string
}
export interface PublicApproval {
  revisionId: string
  approved: boolean
  published: boolean
  approvedAt: number | null
  publishedAt: number | null
}
