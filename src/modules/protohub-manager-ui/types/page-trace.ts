import type { Project, Revision, ReviewPage, WorkspaceContext } from './index'
export interface TraceScope {
  actorId: string
  project: Project
  revision: Revision
  context: WorkspaceContext
  initialPage?: ReviewPage
}
export interface TraceTarget {
  versionId: string
  revisionId: string
}
export interface TraceIdentity extends TraceTarget {
  id: string
  projectId: string
  configVersion: number
  createdAt: number
  updatedAt: number
}
export interface PageRelationDraft {
  fromPageId: string
  toPageId: string
  label: string
  note: string
}
export interface PageRelation extends TraceIdentity, PageRelationDraft {}
export const traceSourceKinds = ['work-item', 'material', 'description', 'check'] as const
export type TraceSourceKind = (typeof traceSourceKinds)[number]
export interface TraceSourceRef {
  kind: TraceSourceKind
  id: string
  expectedVersion: number
}
export interface ResolvedTraceSource extends TraceSourceRef {
  status: 'current' | 'changed' | 'missing'
  currentVersion: number | null
  title: string | null
}
export interface TraceContext extends TraceTarget {
  id: string | null
  projectId: string
  pageId: string
  entry: boolean
  references: ResolvedTraceSource[]
  configVersion: number
  createdAt: number | null
  updatedAt: number | null
}
export interface TraceContextDraft {
  entry: boolean
  references: TraceSourceRef[]
}
export interface TraceEntry {
  pageId: string
  configVersion: number
  updatedAt: number
}
export interface TraceSourceCandidate {
  kind: TraceSourceKind
  id: string
  title: string
  configVersion: number
}
export interface TraceSourceDetail extends TraceSourceCandidate {
  fields: Record<string, string>
}
export interface TraceDecisionDraft {
  title: string
  decision: string
  rationale: string
}
export interface TraceDecision extends TraceIdentity, TraceDecisionDraft {
  pageId: string
  authorId: string
  updatedBy: string
}
export interface TracePageQuery {
  pageIndex: number
  pageSize: number
}
export interface TraceRelationQuery extends TracePageQuery {
  pageId?: string
  direction?: 'all' | 'incoming' | 'outgoing'
  keyword?: string
}
export interface TraceRequest {
  clientRequestId: string
}
export interface TraceDelete extends TraceRequest {
  expectedVersion: number
}
