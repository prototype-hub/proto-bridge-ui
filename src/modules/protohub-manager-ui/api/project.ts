import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type {
  PrototypeListQuery,
  Project,
  ProjectInput,
  ProjectUsage,
  ProjectMember,
  MemberCandidate,
  OwnershipMigration,
} from '../types'
const segment = encodeURIComponent
export const projectsApi = {
  /** Query only the current user's authorized projects; legacy list keeps its array contract. */
  query: async (query: PrototypeListQuery, options?: RequestOptions) =>
    (await request.post<PageResult<Project>>('/prototype-hub/projects/_query', query, options))
      .result,
  list: async (options?: RequestOptions) =>
    (await request.get<Project[]>('/prototype-hub/projects', undefined, options)).result,
  usage: async (options?: RequestOptions) =>
    (await request.get<ProjectUsage>('/prototype-hub/projects/_usage', undefined, options)).result,
  get: async (id: string, options?: RequestOptions) =>
    (await request.get<Project>(`/prototype-hub/projects/${segment(id)}`, undefined, options))
      .result,
  create: async (input: ProjectInput, options?: RequestOptions) =>
    (await request.post<Project>('/prototype-hub/projects', input, options)).result,
  update: async (id: string, input: ProjectInput) =>
    (await request.put<Project>(`/prototype-hub/projects/${segment(id)}`, input)).result,
  remove: (id: string) => request.remove(`/prototype-hub/projects/${segment(id)}`),
  members: async (id: string, options?: RequestOptions) =>
    (
      await request.get<ProjectMember[]>(
        `/prototype-hub/projects/${segment(id)}/members`,
        undefined,
        options,
      )
    ).result,
  candidates: async (id: string, keyword: string, options?: RequestOptions) =>
    (
      await request.get<MemberCandidate[]>(
        `/prototype-hub/projects/${segment(id)}/member-candidates`,
        { keyword },
        options,
      )
    ).result,
  saveMember: (id: string, userId: string, role: 'editor' | 'viewer', options?: RequestOptions) =>
    request.put(
      `/prototype-hub/projects/${segment(id)}/members/${segment(userId)}`,
      { role },
      options,
    ),
  removeMember: (id: string, userId: string, options?: RequestOptions) =>
    request.remove(
      `/prototype-hub/projects/${segment(id)}/members/${segment(userId)}`,
      undefined,
      options,
    ),
  claim: (id: string, userId: string, options?: RequestOptions) =>
    request.post(`/prototype-hub/projects/${segment(id)}/claim`, { userId }, options),
  migrateOwnership: async (apply: boolean, options?: RequestOptions) =>
    (
      await request.post<OwnershipMigration>(
        '/prototype-hub/projects/_ownership-migration',
        { apply },
        options,
      )
    ).result,
}
