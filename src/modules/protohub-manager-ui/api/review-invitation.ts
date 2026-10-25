import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type { CreatedReviewInvitation, ReviewInvitation } from '../types'

const base = (shareId: string) =>
  `/prototype-hub/shares/${encodeURIComponent(shareId)}/review-invitations`

export const reviewInvitationsApi = {
  create: async (
    shareId: string,
    email: string,
    expectedShareVersion: number,
    options?: RequestOptions,
  ) =>
    (
      await request.post<CreatedReviewInvitation>(
        base(shareId),
        { email, expectedShareVersion },
        options,
      )
    ).result,
  query: async (
    shareId: string,
    page: { pageIndex: number; pageSize: number },
    options?: RequestOptions,
  ) =>
    (await request.post<PageResult<ReviewInvitation>>(`${base(shareId)}/_query`, page, options))
      .result,
  revoke: async (shareId: string, id: string, expectedVersion: number, options?: RequestOptions) =>
    (
      await request.put<ReviewInvitation>(
        `${base(shareId)}/${encodeURIComponent(id)}/revoke`,
        { expectedVersion },
        options,
      )
    ).result,
}
