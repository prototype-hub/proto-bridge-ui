import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type { PrototypeSearchPage, PrototypeSearchQuery } from '../types/search'

/** Keywords remain in a POST body; this endpoint never receives guest or runtime credentials. */
export const prototypeSearchApi = {
  query: async (query: PrototypeSearchQuery, options?: RequestOptions) =>
    (await request.post<PrototypeSearchPage>('/prototype-hub/search/_query', query, options))
      .result,
}
