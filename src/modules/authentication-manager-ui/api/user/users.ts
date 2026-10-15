import { request } from '@/shared/api/client'
import type { Query, PageResult, RequestOptions } from '@/shared/api/types'
import type {
  ManagedUser,
  UserInput,
  UserValidationResult,
} from '@/modules/authentication-manager-ui/types/user'
import { userPayload } from '@/modules/authentication-manager-ui/utils/user'
const id = encodeURIComponent

export const usersApi = {
  list: async (query: Query, options?: RequestOptions) =>
    (await request.post<PageResult<ManagedUser>>('/user/detail/_query', query, options)).result,
  get: async (key: string) => (await request.get<ManagedUser>(`/user/detail/${id(key)}`)).result,
  save: (input: UserInput) =>
    input.id
      ? request.put(`/user/detail/${id(input.id)}/_update`, userPayload(input))
      : request.post('/user/detail/_create', userPayload(input)),
  status: (key: string, status: number) => request.patch('/user', { id: key, status }),
  remove: (key: string) => request.remove(`/user/${id(key)}`),
  password: (key: string, password: string) =>
    request.post(`/user/${id(key)}/password/_reset`, password, {
      headers: { 'Content-Type': 'text/plain' },
    }),
  validate: async (type: 'username' | 'password', value: string) =>
    (
      await request.post<UserValidationResult>(`/user/${type}/_validate`, value, {
        headers: { 'Content-Type': 'text/plain' },
      })
    ).result,
}
