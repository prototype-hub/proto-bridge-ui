import type { Project, PublicShare, Revision, WorkspaceContext } from './index'
import type { DemoScriptStep } from './demo-script'
export type StudyState = 'draft' | 'open' | 'closed'
export interface StudyTask {
  id: string
  title: string
  objective: string
  prerequisites: string
  resetNote: string
  steps: DemoScriptStep[]
}
export interface StudyQuestion {
  id: string
  prompt: string
  type: 'singleChoice' | 'rating' | 'text'
  required: boolean
  options: { id: string; label: string }[]
}
export interface StudyDefinition {
  title: string
  introduction: string
  consentText: string
  tasks: StudyTask[]
  questions: StudyQuestion[]
}
export interface StudySummary {
  id: string
  projectId: string
  versionId: string
  revisionId: string
  title: string
  state: StudyState
  contentVersion: number | null
  configVersion: number
  createdAt: number
  updatedAt: number
}
export interface Study extends StudySummary, StudyDefinition {
  createdBy: string
  updatedBy: string
}
export interface PublicStudySummary {
  id: string
  title: string
  state: 'open' | 'closed'
}
export interface PublicStudy extends StudyDefinition, PublicStudySummary {
  contentVersion: number
}
export interface StudyTaskAnswer {
  taskId: string
  outcome: 'completed' | 'not_completed' | 'skipped'
  feedback: string
}
export interface StudyQuestionAnswer {
  questionId: string
  optionId?: string
  rating?: number
  text?: string
}
/** HTTP response records retain unused nullable values; outgoing answers use StudyQuestionAnswer. */
export interface StudyQuestionAnswerWire {
  questionId: string
  optionId?: string | null
  rating?: number | null
  text?: string | null
}
export interface StudyAnswers {
  taskAnswers: StudyTaskAnswer[]
  answers: StudyQuestionAnswer[]
  feedback: string
}
export type StudyResponseWire<T extends StudyAnswers> = Omit<T, 'answers'> & {
  answers: StudyQuestionAnswerWire[]
}
export interface MemberStudyResponse extends StudyAnswers {
  id: string
  contentVersion: number
  status: 'submitted'
}
export interface OwnStudyResponse extends Omit<MemberStudyResponse, 'status'> {
  status: 'draft' | 'submitted' | 'withdrawn'
  configVersion: number
}
export interface StudyContext {
  study: PublicStudy
  participation: OwnStudyResponse | null
}
export interface StudyMutationResult {
  status: 'current' | 'missing'
  participation: OwnStudyResponse | null
}
export interface StudyAggregate {
  submittedCount: number
  tasks: {
    title: string
    completed: number
    notCompleted: number
    skipped: number
    missing: number
  }[]
  questions: {
    prompt: string
    type: 'singleChoice' | 'rating'
    answered: number
    missing: number
    options: { label: string; count: number }[]
  }[]
  excludedTextQuestionCount: number
}
export type StudyScope =
  | {
      kind: 'member'
      actorId: string
      project: Project
      revision: Revision
      context: WorkspaceContext
    }
  | { kind: 'public'; share: PublicShare; context: WorkspaceContext }
export interface StudyMutation {
  clientRequestId: string
  expectedVersion: number
}
export interface ParticipationInput {
  clientRequestId: string
  contentVersion: number
  expectedVersion?: number
  agreed?: true
  taskAnswers?: StudyTaskAnswer[]
  answers?: StudyQuestionAnswer[]
  feedback?: string
}
