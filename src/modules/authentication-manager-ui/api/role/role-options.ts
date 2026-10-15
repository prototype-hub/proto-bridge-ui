import { request } from '@/shared/api/client'
import { recordsOf } from '@/modules/authentication-manager-ui/utils/model'
import type { Query, PageResult, RequestOptions } from '@/shared/api/types'
import type { ManagedUser } from '@/modules/authentication-manager-ui/types/user'
import { scopedIdentityTerms } from '@/modules/authentication-manager-ui/utils/identity'

export const roleIdentityApi = {
  roleOptions: async () =>
    recordsOf(
      await request.post(
        '/role/group/detail/_query/tree',
        { paging: false, sorts: [{ name: 'createTime', order: 'desc' }] },
        { silent: true },
      ),
    ).map((group) => ({
      value: `group:${String(group.groupId || group.id)}`,
      label: String(group.groupName || group.name),
      selectable: false,
      children: recordsOf(group.roles).map((role) => ({ value: role.id, label: role.name })),
    })),
  groups: async (name = '') =>
    recordsOf(
      await request.post('/role/group/_query/no-paging', {
        paging: false,
        sorts: [{ name: 'createTime', order: 'desc' }],
        terms: name ? [{ column: 'name', termType: 'like', value: `%${name}%` }] : [],
      }),
    ),
  saveGroup: (data: { id: string; name: string }) => request.patch('/role/group', data),
  deleteGroup: (key: string) => request.remove(`/role/group/${encodeURIComponent(key)}`),
  roleUsers: async (role: string, query: Query, candidates = false, options?: RequestOptions) => {
    const data: Query = {
      ...query,
      sorts: [{ name: 'createTime', order: 'desc' }],
      terms: scopedIdentityTerms(query.terms, [
        { column: `id$in-dimension$role${candidates ? '$not' : ''}`, value: role },
        ...(candidates ? [{ column: 'username', termType: 'not', value: 'admin' }] : []),
      ]),
    }
    // Keep the legacy two-argument call when no transport options were supplied.
    const response = options
      ? await request.post<PageResult<ManagedUser>>('/user/_query/', data, options)
      : await request.post<PageResult<ManagedUser>>('/user/_query/', data)
    return response.result
  },
}
