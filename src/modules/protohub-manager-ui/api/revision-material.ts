import { request } from '@/shared/api/client'
import { t } from '@/shared/i18n'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type {
  MaterialQuery,
  MaterialSource,
  MaterialText,
  MaterialPreview,
  RevisionMaterial,
} from '../types/revision-material'
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
  get: async (version: string, revision: string, id: string, options?: RequestOptions) =>
    (
      await request.get<RevisionMaterial>(
        `${root(version, revision)}/${segment(id)}`,
        undefined,
        options,
      )
    ).result,
  text: async (version: string, revision: string, id: string, options?: RequestOptions) =>
    (
      await request.get<MaterialText>(
        `${root(version, revision)}/${segment(id)}/text`,
        undefined,
        options,
      )
    ).result,
  extractText: async (version: string, revision: string, id: string, options?: RequestOptions) =>
    (
      await request.post<MaterialText>(
        `${root(version, revision)}/${segment(id)}/text/_extract`,
        undefined,
        { ...options, timeout: 120000 },
      )
    ).result,
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
        timeout: 120000,
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
  link: async (
    version: string,
    revision: string,
    source: MaterialSource,
    key: string,
    options?: RequestOptions,
  ) =>
    (
      await request.post<RevisionMaterial>(
        `${root(version, revision)}/links`,
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
  preview: async (
    version: string,
    revision: string,
    id: string,
    page: number,
    options?: RequestOptions,
  ): Promise<MaterialPreview> => {
    const response = await request.getStream(
      `${root(version, revision)}/${segment(id)}/preview`,
      { page },
      { ...options, timeout: 45000 },
    )
    const header = (name: string) => {
      const value = String(response.headers?.[`x-preview-${name}`] ?? '')
      return /^(0|[1-9][0-9]*)$/.test(value) ? Number(value) : NaN
    }
    const result = {
      blob: response.blob,
      page: header('page'),
      pages: header('pages'),
      width: header('width'),
      height: header('height'),
    }
    if (
      !/^image\/png(?:;|$)/i.test(response.contentType) ||
      !response.blob.size ||
      response.blob.size > 16 * 1048576 ||
      result.page !== page ||
      result.pages < 1 ||
      result.pages > 100 ||
      result.page >= result.pages ||
      result.width < 1 ||
      result.width > 4096 ||
      result.height < 1 ||
      result.height > 4096 ||
      result.width * result.height > 4000000 ||
      ![result.page, result.pages, result.width, result.height].every(Number.isSafeInteger)
    )
      throw new Error(t('proto.materialVisualFailed'))
    return result
  },
}
