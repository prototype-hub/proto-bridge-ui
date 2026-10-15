import { request } from '@/shared/api/client'
import type { Query, PageResult, RequestOptions } from '@/shared/api/types'
import type { PermissionResource } from '@/modules/authentication-manager-ui/types/permission'
const id = encodeURIComponent

export const permissionsApi = {
  list: async (query: Query, options?: RequestOptions) =>
    (await request.post<PageResult<PermissionResource>>('/permission/_query/', query, options))
      .result,
  validate: async (key: string) =>
    (
      await request.get<{ passed: boolean; reason?: string }>('/permission/id/_validate', {
        id: key,
      })
    ).result,
  create: (data: unknown) => request.post('/permission', data),
  save: (data: unknown) => request.patch('/permission', data),
  remove: (key: string) => request.remove(`/permission/${id(key)}`),
  export: (query: Query) =>
    request.post('/permission/_query/no-paging', { ...query, paging: false }),
}
