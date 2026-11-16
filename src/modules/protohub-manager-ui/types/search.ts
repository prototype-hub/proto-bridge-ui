import type { PageResult } from '@/shared/api/types'
export type SearchType = 'COPY' | 'MATERIAL' | 'FEEDBACK'
export interface SearchScope {
  projectId?: string
  versionId?: string
  revisionId?: string
}
export interface PrototypeSearchQuery extends SearchScope {
  type: SearchType
  keyword: string
  pageIndex: number
  pageSize: number
}
export interface PrototypeSearchResult {
  type: SearchType
  sourceId: string
  projectId: string
  projectName: string
  versionId: string
  versionName: string
  revisionId: string
  revisionCreatedAt: number
  pageId: string | null
  pagePath: string | null
  threadId: string | null
  title: string
  snippet: string
  matchField: string
  visibility: string | null
  materialType: string | null
  updatedAt: number
}
export type PrototypeSearchPage = PageResult<PrototypeSearchResult>
