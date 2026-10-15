import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type { ServerMenu } from '@/shared/auth/types'
const id = encodeURIComponent

export const menusApi = {
  list: async (options?: RequestOptions) =>
    (await request.post<ServerMenu[]>('/menu/_all/tree', { paging: false }, options)).result,
  save: (input: ServerMenu, creating: boolean) =>
    creating ? request.post('/menu', input) : request.patch('/menu', input),
  remove: (key: string) => request.remove(`/menu/${id(key)}`),
  validate: async (code: string) =>
    (await request.get<{ passed: boolean; reason?: string }>('/menu/code/_validate', { code }))
      .result,
}
