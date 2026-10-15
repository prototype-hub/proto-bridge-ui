import { request } from '@/shared/api/client'
import type { Query, PageResult, RequestOptions } from '@/shared/api/types'
import type { Role } from '@/modules/authentication-manager-ui/types/role'
import type { ManagedUser } from '@/modules/authentication-manager-ui/types/user'
import type { ServerMenu } from '@/shared/auth/types'
const id = encodeURIComponent

export const rolesApi = {
  list: async (query: Query, options?: RequestOptions) =>
    (await request.post<PageResult<Role>>('/role/_query/', query, options)).result,
  all: async () => (await request.get<Role[]>('/role/_query/no-paging', { paging: false })).result,
  save: (input: Role) => (input.id ? request.patch('/role', input) : request.post('/role', input)),
  create: (input: Role) => {
    const { id: _id, ...data } = input
    return request.post<Role>('/role', data)
  },
  remove: (key: string) => request.remove(`/role/${id(key)}`),
  grants: async (key: string, options?: RequestOptions) =>
    (
      await request.get<ServerMenu[]>(
        `/menu/role/${id(key)}/_grant/tree`,
        {
          'terms[0].column': 'options',
          'terms[0].termType': 'nlike',
          'terms[0].value': '%show":false%',
        },
        options,
      )
    ).result,
  grant: (key: string, menus: ServerMenu[]) =>
    request.put(`/menu/role/${id(key)}/_grant`, { menus }),
  members: async (key: string) =>
    (
      await request.post<PageResult<ManagedUser>>('/user/_query/', {
        paging: false,
        terms: [{ column: 'id$in-dimension$role', termType: 'eq', value: key }],
      })
    ).result,
  bind: (key: string, users: string[]) => request.post(`/role/${id(key)}/users/_bind`, users),
  unbind: (key: string, users: string[]) => request.post(`/role/${id(key)}/users/_unbind`, users),
}
