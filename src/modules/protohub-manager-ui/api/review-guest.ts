import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type { ReviewGuest } from '../types'

const base = (projectId: string) =>
  `/prototype-hub/projects/${encodeURIComponent(projectId)}/review-guests`

/** Project-scoped management uses platform authorization; public review cookies stay in review.ts. */
export const reviewGuestsApi = {
  query: async (
    projectId: string,
    page: { pageIndex: number; pageSize: number },
    options?: RequestOptions,
  ) =>
    (await request.post<PageResult<ReviewGuest>>(`${base(projectId)}/_query`, page, options))
      .result,
  setEnabled: async (
    projectId: string,
    guestId: string,
    enabled: boolean,
    expectedVersion: number,
    options?: RequestOptions,
  ) =>
    (
      await request.put<ReviewGuest>(
        `${base(projectId)}/${encodeURIComponent(guestId)}/enabled`,
        { enabled, expectedVersion },
        options,
      )
    ).result,
}
