import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type {
  CodeMappingTarget,
  CodeMappingCard,
  CodeMappingCreate,
  CodeMappingUpdate,
  CodeMappingDelete,
  CodeMappingImport,
  CodeMappingImportResult,
} from '../types/code-mapping'
const enc = encodeURIComponent
const base = (target: CodeMappingTarget) =>
  `/prototype-hub/versions/${enc(target.versionId)}/revisions/${enc(target.revisionId)}/pages/${enc(target.pageId)}/code-mappings`
/** Every card operation stays on the selected immutable page; paths and snippets are only text. */
export const codeMappingApi = {
  query: async (
    target: CodeMappingTarget,
    input: { keyword?: string; pageIndex: number; pageSize: number },
    options?: RequestOptions,
  ) =>
    (await request.post<PageResult<CodeMappingCard>>(`${base(target)}/_query`, input, options))
      .result,
  get: async (target: CodeMappingTarget, id: string, options?: RequestOptions) =>
    (await request.get<CodeMappingCard>(`${base(target)}/${enc(id)}`, undefined, options)).result,
  create: async (target: CodeMappingTarget, input: CodeMappingCreate, options?: RequestOptions) =>
    (await request.post<CodeMappingCard>(base(target), input, options)).result,
  update: async (
    target: CodeMappingTarget,
    id: string,
    input: CodeMappingUpdate,
    options?: RequestOptions,
  ) => (await request.put<CodeMappingCard>(`${base(target)}/${enc(id)}`, input, options)).result,
  remove: async (
    target: CodeMappingTarget,
    id: string,
    input: CodeMappingDelete,
    options?: RequestOptions,
  ) => (await request.post<boolean>(`${base(target)}/${enc(id)}/_delete`, input, options)).result,
  export: (target: CodeMappingTarget, ids: string[], options?: RequestOptions) =>
    request.postStream(`${base(target)}/_export`, { ids }, options),
  import: async (target: CodeMappingTarget, input: CodeMappingImport, options?: RequestOptions) =>
    (await request.post<CodeMappingImportResult>(`${base(target)}/_import`, input, options)).result,
}
