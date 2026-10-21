import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type { Version, PrototypePage, VersionUsage, PreviewSession } from '../types'
const segment = encodeURIComponent
function uploadData(name: string, description: string, file: File) {
  const data = new FormData()
  data.append('versionName', name)
  data.append('description', description)
  data.append('file', file)
  return data
}
export const versionsApi = {
  list: async (projectId: string, options?: RequestOptions) =>
    (await request.get<Version[]>('/prototype-hub/versions', { projectId }, options)).result,
  usage: async (projectId: string, options?: RequestOptions) =>
    (await request.get<VersionUsage>('/prototype-hub/versions/_usage', { projectId }, options))
      .result,
  get: async (id: string, options?: RequestOptions) =>
    (await request.get<Version>(`/prototype-hub/versions/${segment(id)}`, undefined, options))
      .result,
  pages: async (id: string, options?: RequestOptions) =>
    (
      await request.get<PrototypePage[]>(
        `/prototype-hub/versions/${segment(id)}/pages`,
        undefined,
        options,
      )
    ).result,
  previewSession: async (id: string, options?: RequestOptions) =>
    (
      await request.post<PreviewSession>(
        `/prototype-hub/versions/${segment(id)}/preview-session`,
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
    options?: RequestOptions,
  ) =>
    (
      await request.put<Version>(
        `/prototype-hub/versions/${segment(id)}`,
        uploadData(name, description, file),
        { ...options, timeout: 1800000 },
      )
    ).result,
  remove: (id: string) => request.remove(`/prototype-hub/versions/${segment(id)}`),
}
