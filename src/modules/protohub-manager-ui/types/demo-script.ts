import type { Project, PublicShare, Revision, WorkspaceContext } from './index'

export interface DemoScriptStep {
  id: string
  pageId: string
  narration: string
}
export interface DemoScriptDraft {
  title: string
  objective: string
  prerequisites: string
  resetNote: string
  steps: DemoScriptStep[]
  shareEnabled: boolean
}
export interface DemoScriptSummary {
  id: string
  projectId: string
  versionId: string
  revisionId: string
  title: string
  shareEnabled: boolean
  configVersion: number
  createdAt: number
  updatedAt: number
}
export interface DemoScript extends DemoScriptSummary, DemoScriptDraft {}
export interface PublicDemoScriptSummary {
  id: string
  revisionId: string
  title: string
}
export interface PublicDemoScript extends PublicDemoScriptSummary {
  objective: string
  prerequisites: string
  resetNote: string
  steps: DemoScriptStep[]
}
export type DemoScriptScope =
  | {
      kind: 'member'
      actorId: string
      project: Project
      revision: Revision
      context: WorkspaceContext
    }
  | { kind: 'public'; share: PublicShare; context: WorkspaceContext }
export interface DemoScriptTarget {
  revisionId: string
  scriptId?: string
  stepId?: string
}
export interface DemoScriptInput extends DemoScriptDraft {
  clientRequestId: string
}
