import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type {
  PageDelivery,
  PageDeliveryCandidate,
  PageDeliveryInput,
  PageDeliveryState,
} from '../types'

const base = (versionId: string) =>
  `/prototype-hub/versions/${encodeURIComponent(versionId)}/page-deliveries`
export const pageDeliveriesApi = {
  get: async (versionId: string, pageId: string, revisionId: string, options?: RequestOptions) =>
    (
      await request.get<PageDelivery>(
        `${base(versionId)}/${encodeURIComponent(pageId)}`,
        { revisionId },
        options,
      )
    ).result,
  save: async (
    versionId: string,
    pageId: string,
    data: PageDeliveryInput,
    options?: RequestOptions,
  ) =>
    (
      await request.put<PageDelivery>(
        `${base(versionId)}/${encodeURIComponent(pageId)}`,
        data,
        options,
      )
    ).result,
  query: async (
    versionId: string,
    data: { revisionId: string; state?: PageDeliveryState; pageIndex: number; pageSize: number },
    options?: RequestOptions,
  ) =>
    (await request.post<PageResult<PageDelivery>>(`${base(versionId)}/_query`, data, options))
      .result,
  candidates: async (
    versionId: string,
    data: { revisionId: string; keyword?: string; pageIndex: number; pageSize: number },
    options?: RequestOptions,
  ) =>
    (
      await request.post<PageResult<PageDeliveryCandidate>>(
        `${base(versionId)}/_candidates`,
        data,
        options,
      )
    ).result,
}
