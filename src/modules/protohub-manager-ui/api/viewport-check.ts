import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type {
  ViewportTarget,
  ViewportPage,
  ViewportCheck,
  ViewportInput,
  ViewportCategory,
  ViewportResult,
} from '../types/viewport-check'

function base(target: ViewportTarget) {
  return `/prototype-hub/versions/${encodeURIComponent(target.versionId)}/revisions/${encodeURIComponent(target.revisionId)}/pages/${encodeURIComponent(target.pageId)}/viewport-checks`
}
export const viewportCheckApi = {
  query: async (
    target: ViewportTarget,
    input: {
      pageIndex: number
      pageSize: number
      category?: ViewportCategory
      result?: ViewportResult
    },
    options?: RequestOptions,
  ) => (await request.post<ViewportPage>(`${base(target)}/_query`, input, options)).result,
  create: async (target: ViewportTarget, input: ViewportInput, options?: RequestOptions) =>
    (await request.post<ViewportCheck>(base(target), input, options)).result,
  update: async (
    target: ViewportTarget,
    id: string,
    input: ViewportInput & { expectedVersion: number },
    options?: RequestOptions,
  ) =>
    (await request.put<ViewportCheck>(`${base(target)}/${encodeURIComponent(id)}`, input, options))
      .result,
  remove: async (
    target: ViewportTarget,
    id: string,
    input: { clientRequestId: string; expectedVersion: number },
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
