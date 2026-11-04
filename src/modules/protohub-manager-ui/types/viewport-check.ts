import type { PageResult } from '@/shared/api/types'

export const viewportCategories = [
  'normal',
  'empty',
  'loading',
  'permission',
  'boundary',
  'error',
] as const
export const viewportResults = ['untested', 'passed', 'failed'] as const
export type ViewportCategory = (typeof viewportCategories)[number]
export type ViewportResult = (typeof viewportResults)[number]
export interface ViewportTarget {
  versionId: string
  revisionId: string
  pageId: string
}
export interface ViewportDraft {
  title: string
  category: ViewportCategory
  steps: string
  expected: string
  observed: string
  evidence: string
  result: ViewportResult
  viewportWidth: number
  viewportHeight: number
  viewportScale: number
}
export interface ViewportCheck extends Omit<ViewportDraft, 'category' | 'result'>, ViewportTarget {
  id: string
  projectId: string
  category: { value: ViewportCategory; text: string }
  result: { value: ViewportResult; text: string }
  configVersion: number
  createdAt: number
  updatedAt: number
}
export interface ViewportInput extends ViewportDraft {
  clientRequestId: string
}
export type ViewportPage = PageResult<ViewportCheck>
