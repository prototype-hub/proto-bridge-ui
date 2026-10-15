import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type { Project, ProjectInput } from '../types'
const segment = encodeURIComponent
export const projectsApi = {
  list: async (options?: RequestOptions) =>
    (await request.get<Project[]>('/prototype-hub/projects', undefined, options)).result,
  get: async (id: string, options?: RequestOptions) =>
    (await request.get<Project>(`/prototype-hub/projects/${segment(id)}`, undefined, options))
      .result,
  create: async (input: ProjectInput) =>
    (await request.post<Project>('/prototype-hub/projects', input)).result,
  update: async (id: string, input: ProjectInput) =>
    (await request.put<Project>(`/prototype-hub/projects/${segment(id)}`, input)).result,
  remove: (id: string) => request.remove(`/prototype-hub/projects/${segment(id)}`),
}
