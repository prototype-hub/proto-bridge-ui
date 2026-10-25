import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type {
  PrototypeListQuery,
  Version,
  Revision,
  PrototypePage,
  VersionUsage,
  PreviewSession,
  RevisionComparison,
  ComparisonQuery,
  RevisionQuality,
} from '../types'
const segment = encodeURIComponent
function uploadData(name: string, description: string, file: File, expectedRevisionId?: string) {
  const data = new FormData()
  data.append('versionName', name)
  data.append('description', description)
  data.append('file', file)
  if (expectedRevisionId) data.append('expectedRevisionId', expectedRevisionId)
  return data
}
export const versionsApi = {
  /** Check only the selected immutable revision; pagination and download reuse this report. */
  quality: async (id: string, revisionId: string, options?: RequestOptions) =>
    (
      await request.get<RevisionQuality>(
        `/prototype-hub/versions/${segment(id)}/revisions/${segment(revisionId)}/quality`,
        undefined,
        options,
      )
    ).result,
  /** Compare only explicit immutable revisions; never resolve the mutable current pointer. */
  compare: async (id: string, query: ComparisonQuery, options?: RequestOptions) =>
    (
      await request.get<RevisionComparison>(
        `/prototype-hub/versions/${segment(id)}/revisions/_compare`,
        query,
        options,
      )
    ).result,
  /** Omit projectId for one paged query across the server-authorized editable projects. */
  deleted: async (
    projectId: string | undefined,
    query: PrototypeListQuery,
    options?: RequestOptions,
  ) =>
    (
      await request.post<PageResult<Version>>('/prototype-hub/versions/_deleted/_query', query, {
        ...options,
        params: projectId === undefined ? undefined : { projectId },
      })
    ).result,
  restore: async (id: string, options?: RequestOptions) =>
    (
      await request.post<Version>(
        `/prototype-hub/versions/${segment(id)}/_restore`,
        undefined,
        options,
      )
    ).result,
  /** Keep project scope outside the typed filter body so callers cannot replace that boundary. */
  query: async (projectId: string, query: PrototypeListQuery, options?: RequestOptions) =>
    (
      await request.post<PageResult<Version>>('/prototype-hub/versions/_query', query, {
        ...options,
        params: { projectId },
      })
    ).result,
  list: async (projectId: string, options?: RequestOptions) =>
    (await request.get<Version[]>('/prototype-hub/versions', { projectId }, options)).result,
  usage: async (projectId: string, options?: RequestOptions) =>
    (await request.get<VersionUsage>('/prototype-hub/versions/_usage', { projectId }, options))
      .result,
  get: async (id: string, options?: RequestOptions) =>
    (await request.get<Version>(`/prototype-hub/versions/${segment(id)}`, undefined, options))
      .result,
  currentRevision: async (id: string, options?: RequestOptions) =>
    (
      await request.get<Revision>(
        `/prototype-hub/versions/${segment(id)}/current-revision`,
        undefined,
        options,
      )
    ).result,
  revisions: async (id: string, after?: string, limit = 50, options?: RequestOptions) =>
    (
      await request.get<Revision[]>(
        `/prototype-hub/versions/${segment(id)}/revisions`,
        { after, limit },
        options,
      )
    ).result,
  revision: async (id: string, revisionId: string, options?: RequestOptions) =>
    (
      await request.get<Revision>(
        `/prototype-hub/versions/${segment(id)}/revisions/${segment(revisionId)}`,
        undefined,
        options,
      )
    ).result,
  revisionPages: async (id: string, revisionId: string, options?: RequestOptions) =>
    (
      await request.get<PrototypePage[]>(
        `/prototype-hub/versions/${segment(id)}/revisions/${segment(revisionId)}/pages`,
        undefined,
        options,
      )
    ).result,
  revisionPreviewSession: async (id: string, revisionId: string, options?: RequestOptions) =>
    (
      await request.post<PreviewSession>(
        `/prototype-hub/versions/${segment(id)}/revisions/${segment(revisionId)}/preview-session`,
        undefined,
        options,
      )
    ).result,
  upload: async (
    projectId: string,
    name: string,
    description: string,
    file: File,
    options?: RequestOptions,
  ) =>
    (
      await request.post<Version>(
        `/prototype-hub/projects/${segment(projectId)}/versions`,
        uploadData(name, description, file),
        { ...options, timeout: 1800000 },
      )
    ).result,
  update: async (
    id: string,
    name: string,
    description: string,
    file: File,
    expectedRevisionId?: string,
    options?: RequestOptions,
  ) =>
    (
      await request.put<Version>(
        `/prototype-hub/versions/${segment(id)}`,
        uploadData(name, description, file, expectedRevisionId),
        { ...options, timeout: 1800000 },
      )
    ).result,
  remove: (id: string) => request.remove(`/prototype-hub/versions/${segment(id)}`),
}
