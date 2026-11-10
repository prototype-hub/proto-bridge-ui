import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type { MaterialQuery, MaterialSource, RevisionMaterial } from '../types/revision-material'
const segment = encodeURIComponent
function root(versionId: string, revisionId: string) {
  return `/prototype-hub/versions/${segment(versionId)}/revisions/${segment(revisionId)}/materials`
}
export function appendSource(data: FormData, source?: MaterialSource) {
  if (!source) return data
  for (const key of ['sourceTool', 'sourceName', 'sourceUrl', 'sourceNotes'] as const)
    if (source[key]?.trim()) data.append(key, source[key]!.trim())
  return data
}
export const revisionMaterialsApi = {
  query: async (
    version: string,
    revision: string,
    query: MaterialQuery,
    options?: RequestOptions,
  ) =>
    (
      await request.post<PageResult<RevisionMaterial>>(
        `${root(version, revision)}/_query`,
        query,
        options,
      )
    ).result,
  upload: async (
    version: string,
    revision: string,
    file: File,
    source: MaterialSource,
    key: string,
    options?: RequestOptions,
  ) => {
    const data = appendSource(new FormData(), source)
    data.append('file', file)
    return (
      await request.post<RevisionMaterial>(root(version, revision), data, {
        ...options,
        headers: { ...options?.headers, 'Idempotency-Key': key },
      })
    ).result
  },
  declare: async (
    version: string,
    revision: string,
    source: MaterialSource,
    key: string,
    options?: RequestOptions,
  ) =>
    (
      await request.post<RevisionMaterial>(
        `${root(version, revision)}/prototype-source`,
        { ...source, clientRequestId: key },
        options,
      )
    ).result,
  update: async (
    version: string,
    revision: string,
    id: string,
    source: MaterialSource,
    expectedVersion: number,
    key: string,
    options?: RequestOptions,
  ) =>
    (
      await request.put<RevisionMaterial>(
        `${root(version, revision)}/${segment(id)}`,
        { ...source, expectedVersion, clientRequestId: key },
        options,
      )
    ).result,
  remove: async (
    version: string,
    revision: string,
    id: string,
    expectedVersion: number,
    key: string,
    options?: RequestOptions,
  ) =>
    (
      await request.post<boolean>(
        `${root(version, revision)}/${segment(id)}/_delete`,
        { expectedVersion, clientRequestId: key },
        options,
      )
    ).result,
  content: (version: string, revision: string, id: string, options?: RequestOptions) =>
    request.getStream(`${root(version, revision)}/${segment(id)}/content`, undefined, options),
}
