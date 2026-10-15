import { request } from '@/shared/api/client'
import type { Query, PageResult, RequestOptions } from '@/shared/api/types'
import type { AccessLog } from '@/modules/authentication-manager-ui/types/logs'

export const logsApi = {
  list: async (query: Query, options?: RequestOptions) =>
    (await request.post<PageResult<AccessLog>>('/logger/access/_query', query, options)).result,
}
