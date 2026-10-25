import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type { Share, ShareInput, ShareUpdate, ReviewPolicy } from '../types'
const segment = encodeURIComponent
export const sharesApi = {
  reviewPolicy: async (id: string, options?: RequestOptions) =>
    (
      await request.get<ReviewPolicy>(
        `/prototype-hub/shares/${segment(id)}/review`,
        undefined,
        options,
      )
    ).result,
  setReviewPolicy: async (
    id: string,
    enabled: boolean,
    expectedVersion: number,
    allowUnverified: boolean,
    allowComment: boolean,
    options?: RequestOptions,
  ) =>
    (
      await request.put<ReviewPolicy>(
        `/prototype-hub/shares/${segment(id)}/review`,
        { enabled, expectedVersion, allowUnverified, allowComment },
        options,
      )
    ).result,
  list: async (versionId: string, options?: RequestOptions) =>
    (
      await request.get<Share[]>(
        `/prototype-hub/versions/${segment(versionId)}/shares`,
        undefined,
        options,
      )
    ).result,
  create: async (versionId: string, data: ShareInput) =>
    (await request.post<Share>(`/prototype-hub/versions/${segment(versionId)}/shares`, data))
      .result,
  update: async (id: string, data: ShareUpdate, options?: RequestOptions) =>
    (await request.put<Share>(`/prototype-hub/shares/${segment(id)}`, data, options)).result,
  enabled: async (
    id: string,
    expectedVersion: number,
    enabled: boolean,
    options?: RequestOptions,
  ) =>
    (
      await request.put<Share>(
        `/prototype-hub/shares/${segment(id)}/enabled`,
        { expectedVersion, enabled },
        options,
      )
    ).result,
  revoke: async (id: string, expectedVersion: number, options?: RequestOptions) =>
    (
      await request.post<Share>(
        `/prototype-hub/shares/${segment(id)}/revoke`,
        { expectedVersion },
        options,
      )
    ).result,
  rotate: async (id: string, expectedVersion: number, options?: RequestOptions) =>
    (
      await request.post<Share>(
        `/prototype-hub/shares/${segment(id)}/rotate-link`,
        { expectedVersion },
        options,
      )
    ).result,
  remove: (id: string) => request.remove(`/prototype-hub/shares/${segment(id)}`),
  /** Verify a supplied password without returning the stored hash or requiring an active link. */
  verifyPassword: async (id: string, password: string, options?: RequestOptions) =>
    (
      await request.post<boolean>(
        `/prototype-hub/shares/${segment(id)}/verify-password`,
        { password },
        options,
      )
    ).result,
}
