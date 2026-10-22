import { config } from '@/shared/config'
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
  /** Consume the server grant URL only inside this deployment's canonical anonymous API scope. */
  pages: async (share: PublicShare, options?: RequestOptions) => {
    const base = new URL(config.apiBase.replace(/\/$/, '') + '/', window.location.origin)
    const url = new URL(share.pagesUrl || '', window.location.origin)
    const expected = `${base.pathname}prototype-hub/public/shares/${segment(share.token)}/${segment(share.accessKey || '')}/revisions/${segment(share.revisionId)}/pages`
    if (
      !share.pagesUrl ||
      !share.accessKey ||
      !share.revisionId ||
      url.origin !== window.location.origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== expected
    )
      throw new Error('Invalid public pages URL')
    return (
      await publicRequest.get<PrototypePage[]>(
        url.pathname.slice(base.pathname.length - 1),
        undefined,
        { ...options, silent: true },
      )
    ).result
  },
}
