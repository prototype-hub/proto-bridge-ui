import type { PageResult } from '@/shared/api/types'
import type { ReviewAnchor } from '../types'

export interface FunctionalTarget {
  versionId: string
  revisionId: string
  pageId: string
}
export interface FunctionalDraft {
  title: string
  purpose: string
  inputRules: string
  permissionRules: string
  navigationRules: string
  notes: string
  anchor?: ReviewAnchor | null
}
export interface FunctionalSpec extends FunctionalDraft, FunctionalTarget {
  id: string
  projectId: string
  configVersion: number
  createdAt: number
  updatedAt: number
}
export interface FunctionalInput extends FunctionalDraft {
  revisionId: string
  pageId: string
  clientRequestId: string
}
export type FunctionalPage = PageResult<FunctionalSpec>
