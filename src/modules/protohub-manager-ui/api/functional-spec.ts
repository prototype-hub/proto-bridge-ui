import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type {
  FunctionalInput,
  FunctionalPage,
  FunctionalSpec,
  FunctionalTarget,
} from '../types/functional-spec'

const base = (target: FunctionalTarget) =>
  `/prototype-hub/versions/${encodeURIComponent(target.versionId)}/element-descriptions`
export const functionalSpecApi = {
  query: async (
    target: FunctionalTarget,
    query: { keyword?: string; pageIndex: number; pageSize: number },
    options?: RequestOptions,
  ) =>
    (
      await request.post<FunctionalPage>(
        `${base(target)}/_query`,
        { revisionId: target.revisionId, pageId: target.pageId, ...query },
        options,
      )
    ).result,
  get: async (target: FunctionalTarget, id: string, options?: RequestOptions) =>
    (
      await request.get<FunctionalSpec>(
        `${base(target)}/${encodeURIComponent(id)}`,
        { revisionId: target.revisionId, pageId: target.pageId },
        options,
      )
    ).result,
  create: async (target: FunctionalTarget, input: FunctionalInput, options?: RequestOptions) =>
    (await request.post<FunctionalSpec>(base(target), input, options)).result,
  update: async (
    target: FunctionalTarget,
    id: string,
    input: FunctionalInput & { expectedVersion: number },
    options?: RequestOptions,
  ) =>
    (await request.put<FunctionalSpec>(`${base(target)}/${encodeURIComponent(id)}`, input, options))
      .result,
  remove: async (
    target: FunctionalTarget,
    id: string,
    input: { revisionId: string; pageId: string; clientRequestId: string; expectedVersion: number },
    options?: RequestOptions,
  ) =>
    (
      await request.post<boolean>(
        `${base(target)}/${encodeURIComponent(id)}/_delete`,
        input,
        options,
      )
    ).result,
}
