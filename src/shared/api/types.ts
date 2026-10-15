import type { AxiosRequestConfig, AxiosHeaderValue, AxiosHeaders } from 'axios'
export interface ApiResponse<T> {
  success: boolean
  status: number
  result: T
  message?: string
  code?: string
}
export interface RequestOptions extends Omit<AxiosRequestConfig, 'headers'> {
  headers?: Record<string, AxiosHeaderValue> | AxiosHeaders
  silent?: boolean
  hiddenError?: boolean
  requestKey?: string
}
export interface BinaryResponse {
  blob: Blob
  filename: string
  contentType: string
}
export interface PageResult<T> {
  data: T[]
  total: number
  pageIndex: number
  pageSize: number
}
export interface QueryTerm {
  column?: string
  termType?: string
  value?: unknown
  type?: 'and' | 'or'
  terms?: QueryTerm[]
}
export type QuerySource = 'draft' | 'transport'
export interface QueryWireProvenance {
  terms: QueryTerm[]
  source: Pick<QueryTerm, 'column' | 'termType' | 'value'>
}
export interface QueryDraftTerm extends QueryTerm {
  terms?: QueryDraftTerm[]
  __queryWire?: QueryWireProvenance
}
export interface QueryDraft {
  version: 1
  terms: QueryDraftTerm[]
}
export interface QueryOption {
  label: string
  value: string | number
  children?: QueryOption[]
  disabled?: boolean
}
export interface QueryOptionContext {
  search: string
  selected: (string | number)[]
  signal: AbortSignal
}
export type QueryOptionLoader = (
  context: QueryOptionContext,
) => QueryOption[] | Promise<QueryOption[]>
export interface QueryField {
  key: string
  label: string
  type?: 'text' | 'select' | 'date' | 'number' | 'treeSelect' | 'time'
  termType?: string
  operators?: string[]
  rename?: string
  first?: boolean
  options?: QueryOption[]
  loadOptions?: QueryOptionLoader
  resolveOptions?: (
    values: (string | number)[],
    signal: AbortSignal,
  ) => QueryOption[] | Promise<QueryOption[]>
  multiple?: boolean
  prepareValue?: (value: unknown, term: QueryTerm) => unknown
  transform?: (term: QueryTerm) => QueryTerm | QueryTerm[]
  restore?: (term: QueryTerm) => QueryTerm | undefined
}
export interface LegacyQuerySearch {
  type?: 'string' | 'text' | 'select' | 'treeSelect' | 'number' | 'date' | 'time'
  rename?: string
  first?: boolean
  defaultTermType?: string
  termOptions?: string[]
  termFilter?: string[]
  options?: QueryOption[] | (() => QueryOption[] | Promise<QueryOption[]>)
  handleValue?: (value: unknown, term: QueryTerm) => unknown
}
export interface LegacyQueryColumn {
  dataIndex: string
  title: string
  search?: LegacyQuerySearch
}
export interface Query {
  pageIndex?: number
  pageSize?: number
  paging?: boolean
  terms?: QueryTerm[]
  sorts?: { name: string; order: 'asc' | 'desc' }[]
}
