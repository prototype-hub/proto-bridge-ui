import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type {
  ReviewAssociation,
  ReviewAssociationContext,
  ReviewAssociationCreateInput,
  ReviewAssociationRevokeInput,
} from '../types'
const base = (projectId: string) =>
  `/prototype-hub/projects/${encodeURIComponent(projectId)}/review-associations`
/** Member-only association management; public review transport remains isolated. */
export const reviewAssociationsApi = {
  detail: async (projectId: string, sourceThreadId: string, options?: RequestOptions) =>
    (
      await request.post<ReviewAssociationContext>(
        `${base(projectId)}/_detail`,
        { sourceThreadId },
        options,
      )
    ).result,
  query: async (
    projectId: string,
    data: { sourceThreadId: string; pageIndex: number; pageSize: number },
    options?: RequestOptions,
  ) =>
    (await request.post<PageResult<ReviewAssociation>>(`${base(projectId)}/_query`, data, options))
      .result,
  create: async (projectId: string, data: ReviewAssociationCreateInput, options?: RequestOptions) =>
    (await request.post<ReviewAssociation>(base(projectId), data, options)).result,
  revoke: async (
    projectId: string,
    id: string,
    data: ReviewAssociationRevokeInput,
    options?: RequestOptions,
  ) =>
    (
      await request.put<ReviewAssociation>(
        `${base(projectId)}/${encodeURIComponent(id)}/revoke`,
        data,
        options,
      )
    ).result,
}
