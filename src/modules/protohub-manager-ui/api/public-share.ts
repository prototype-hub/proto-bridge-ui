import { publicRequest } from '@/shared/api/public-client'
import type { RequestOptions } from '@/shared/api/types'
import type { PublicShare, PrototypePage } from '../types'
const segment = encodeURIComponent
export const publicApi = {
  get: async (token: string, options?: RequestOptions) =>
    (
      await publicRequest.get<PublicShare>(
        `/prototype-hub/public/shares/${segment(token)}`,
        undefined,
        {
          ...options,
          silent: true,
        },
      )
    ).result,
  verify: async (token: string, password: string, options?: RequestOptions) =>
    (
      await publicRequest.post<PublicShare>(
        `/prototype-hub/public/shares/${segment(token)}/verify`,
        { password },
        { ...options, silent: true },
      )
    ).result,
  pages: async (token: string, key: string, options?: RequestOptions) =>
    (
      await publicRequest.get<PrototypePage[]>(
        `/prototype-hub/public/shares/${segment(token)}/${segment(key)}/pages`,
        undefined,
        { ...options, silent: true },
      )
    ).result,
}
