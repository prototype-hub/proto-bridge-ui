import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type { WorkItem, WorkItemInput, WorkItemQuery, WorkItemDeleteInput } from '../types'

const base = (versionId: string) =>
  `/prototype-hub/versions/${encodeURIComponent(versionId)}/work-items`
export const workItemsApi = {
  query: async (versionId: string, data: WorkItemQuery, options?: RequestOptions) =>
    (await request.post<PageResult<WorkItem>>(`${base(versionId)}/_query`, data, options)).result,
  create: async (versionId: string, data: WorkItemInput, options?: RequestOptions) =>
    (await request.post<WorkItem>(base(versionId), data, options)).result,
  update: async (
    versionId: string,
    id: string,
    data: WorkItemInput & { expectedVersion: number },
    options?: RequestOptions,
  ) =>
    (await request.put<WorkItem>(`${base(versionId)}/${encodeURIComponent(id)}`, data, options))
      .result,
  remove: async (
    versionId: string,
    id: string,
    data: WorkItemDeleteInput,
    options?: RequestOptions,
  ) =>
    (
      await request.post<boolean>(
        `${base(versionId)}/${encodeURIComponent(id)}/_delete`,
        data,
        options,
      )
    ).result,
}
