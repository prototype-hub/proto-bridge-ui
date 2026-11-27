import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type {
  TraceTarget,
  PageRelation,
  PageRelationDraft,
  TraceRelationQuery,
  TracePageQuery,
  TraceRequest,
  TraceDelete,
  TraceContext,
  TraceContextDraft,
  TraceEntry,
  TraceSourceKind,
  TraceSourceCandidate,
  TraceSourceDetail,
  TraceDecision,
  TraceDecisionDraft,
} from '../types/page-trace'
const enc = encodeURIComponent
const base = (target: TraceTarget) =>
  `/prototype-hub/versions/${enc(target.versionId)}/revisions/${enc(target.revisionId)}/page-traceability`
const pageBase = (target: TraceTarget, pageId: string) => `${base(target)}/pages/${enc(pageId)}`
/** All trace reads and writes keep the caller's immutable revision identity. */
export const pageTraceApi = {
  relations: async (target: TraceTarget, query: TraceRelationQuery, options?: RequestOptions) =>
    (
      await request.post<PageResult<PageRelation>>(
        `${base(target)}/relations/_query`,
        query,
        options,
      )
    ).result,
  relation: async (target: TraceTarget, id: string, options?: RequestOptions) =>
    (await request.get<PageRelation>(`${base(target)}/relations/${enc(id)}`, undefined, options))
      .result,
  createRelation: async (
    target: TraceTarget,
    input: PageRelationDraft & TraceRequest,
    options?: RequestOptions,
  ) => (await request.post<PageRelation>(`${base(target)}/relations`, input, options)).result,
  updateRelation: async (
    target: TraceTarget,
    id: string,
    input: PageRelationDraft & TraceDelete,
    options?: RequestOptions,
  ) =>
    (await request.put<PageRelation>(`${base(target)}/relations/${enc(id)}`, input, options))
      .result,
  removeRelation: async (
    target: TraceTarget,
    id: string,
    input: TraceDelete,
    options?: RequestOptions,
  ) =>
    (await request.post<boolean>(`${base(target)}/relations/${enc(id)}/_delete`, input, options))
      .result,
  context: async (target: TraceTarget, pageId: string, options?: RequestOptions) =>
    (await request.get<TraceContext>(`${pageBase(target, pageId)}/context`, undefined, options))
      .result,
  saveContext: async (
    target: TraceTarget,
    pageId: string,
    input: TraceContextDraft & TraceDelete,
    options?: RequestOptions,
  ) =>
    (await request.put<TraceContext>(`${pageBase(target, pageId)}/context`, input, options)).result,
  entries: async (target: TraceTarget, query: TracePageQuery, options?: RequestOptions) =>
    (await request.post<PageResult<TraceEntry>>(`${base(target)}/entries/_query`, query, options))
      .result,
  sources: async (
    target: TraceTarget,
    pageId: string,
    query: TracePageQuery & { kind: TraceSourceKind },
    options?: RequestOptions,
  ) =>
    (
      await request.post<PageResult<TraceSourceCandidate>>(
        `${pageBase(target, pageId)}/sources/_query`,
        query,
        options,
      )
    ).result,
  source: async (
    target: TraceTarget,
    pageId: string,
    kind: TraceSourceKind,
    id: string,
    options?: RequestOptions,
  ) =>
    (
      await request.get<TraceSourceDetail>(
        `${pageBase(target, pageId)}/sources/${enc(kind)}/${enc(id)}`,
        undefined,
        options,
      )
    ).result,
  decisions: async (
    target: TraceTarget,
    pageId: string,
    query: TracePageQuery,
    options?: RequestOptions,
  ) =>
    (
      await request.post<PageResult<TraceDecision>>(
        `${pageBase(target, pageId)}/decisions/_query`,
        query,
        options,
      )
    ).result,
  decision: async (target: TraceTarget, pageId: string, id: string, options?: RequestOptions) =>
    (
      await request.get<TraceDecision>(
        `${pageBase(target, pageId)}/decisions/${enc(id)}`,
        undefined,
        options,
      )
    ).result,
  createDecision: async (
    target: TraceTarget,
    pageId: string,
    input: TraceDecisionDraft & TraceRequest,
    options?: RequestOptions,
  ) =>
    (await request.post<TraceDecision>(`${pageBase(target, pageId)}/decisions`, input, options))
      .result,
  updateDecision: async (
    target: TraceTarget,
    pageId: string,
    id: string,
    input: TraceDecisionDraft & TraceDelete,
    options?: RequestOptions,
  ) =>
    (
      await request.put<TraceDecision>(
        `${pageBase(target, pageId)}/decisions/${enc(id)}`,
        input,
        options,
      )
    ).result,
  removeDecision: async (
    target: TraceTarget,
    pageId: string,
    id: string,
    input: TraceDelete,
    options?: RequestOptions,
  ) =>
    (
      await request.post<boolean>(
        `${pageBase(target, pageId)}/decisions/${enc(id)}/_delete`,
        input,
        options,
      )
    ).result,
}
