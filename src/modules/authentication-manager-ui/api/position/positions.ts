import { request } from '@/shared/api/client'

export const save = (orgId: string, data: unknown) =>
  request.post(`/position/${orgId}/_create`, data)

export const update = (id: string, data: unknown) => request.patch(`/position/${id}/_save`, data)

export const detail = (id: string) =>
  request.post('/position/_query/detail/no-paging', {
    terms: [
      {
        column: 'id',
        termType: 'eq',
        value: id,
      },
    ],
  })
// 职位绑定用户
export const bindUser = (orgId: string, id: string, userIdList: Array<string>) =>
  request.post(`/organization/${orgId}/position/${id}/users/_bind`, userIdList)
// 职位解绑用户
export const unbindUser = (orgId: string, id: string, userIdList: Array<string>) =>
  request.post(`/organization/${orgId}/position/${id}/users/_unbind`, userIdList)

export const del = (id: string) => request.remove(`/position/${id}`)

export const getUser = (data: unknown) => request.post(`/user/detail/_query`, data)

export const queryPage = (data: unknown) => request.post('/position/_query/detail', data)

export const queryPageNoPage = (data?: unknown) => request.post('/position/_query/no-paging', data)

export const queryPositionDetailNoPage = (data?: unknown) =>
  request.post('/position/_query/detail/no-paging', data)
