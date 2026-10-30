import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type { PrototypeStatistics } from '../types'

export const statisticsApi = {
  get: async (days: 7 | 30, options?: RequestOptions) =>
    (await request.get<PrototypeStatistics>('/prototype-hub/statistics', { days }, options)).result,
}
