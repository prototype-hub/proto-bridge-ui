import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type { Share } from '../types'
const segment = encodeURIComponent
export const sharesApi = {
  list: async (versionId: string, options?: RequestOptions) =>
    (
      await request.get<Share[]>(
        `/prototype-hub/versions/${segment(versionId)}/shares`,
        undefined,
        options,
      )
    ).result,
  create: async (
    versionId: string,
    data: { description?: string; password?: string; expiresAt?: number },
  ) =>
    (await request.post<Share>(`/prototype-hub/versions/${segment(versionId)}/shares`, data))
      .result,
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
