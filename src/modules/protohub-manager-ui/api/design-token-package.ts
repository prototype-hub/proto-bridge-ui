import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import { appendSource } from './revision-material'
import type { MaterialSource } from '../types/revision-material'
import type {
  DesignTokenTarget,
  DesignTokenDocument,
  DesignTokenPackage,
  DesignTokenImportResult,
  DesignTokenMutation,
} from '../types/design-token-package'

const enc = encodeURIComponent
const base = (target: DesignTokenTarget) =>
  `/prototype-hub/versions/${enc(target.versionId)}/revisions/${enc(target.revisionId)}/design-token-packages`

/** The original immutable File is sent to the same server parser for preview and import. */
export const designTokenPackagesApi = {
  validate: async (target: DesignTokenTarget, file: File, options?: RequestOptions) => {
    const data = new FormData()
    data.append('file', file)
    return (
      await request.post<DesignTokenDocument>(`${base(target)}/_validate`, data, {
        ...options,
        timeout: 120000,
      })
    ).result
  },
  import: async (
    target: DesignTokenTarget,
    file: File,
    source: MaterialSource,
    allowInvalid: boolean,
    key: string,
    options?: RequestOptions,
  ) => {
    const data = appendSource(new FormData(), source)
    data.append('file', file)
    data.append('allowInvalid', String(allowInvalid))
    return (
      await request.post<DesignTokenImportResult>(`${base(target)}/_import`, data, {
        ...options,
        timeout: 120000,
        headers: { ...options?.headers, 'Idempotency-Key': key },
      })
    ).result
  },
  query: async (
    target: DesignTokenTarget,
    input: { pageIndex: number; pageSize: number },
    options?: RequestOptions,
  ) =>
    (await request.post<PageResult<DesignTokenPackage>>(`${base(target)}/_query`, input, options))
      .result,
  get: async (target: DesignTokenTarget, id: string, options?: RequestOptions) =>
    (await request.get<DesignTokenPackage>(`${base(target)}/${enc(id)}`, undefined, options))
      .result,
  document: async (
    target: DesignTokenTarget,
    id: string,
    inputs?: Record<string, string>,
    options?: RequestOptions,
  ) =>
    (
      await request.post<DesignTokenDocument>(
        `${base(target)}/${enc(id)}/_document`,
        inputs === undefined ? {} : { inputs },
        { ...options, timeout: 120000 },
      )
    ).result,
  content: (target: DesignTokenTarget, id: string, options?: RequestOptions) =>
    request.getStream(`${base(target)}/${enc(id)}/content`, undefined, options),
  update: async (
    target: DesignTokenTarget,
    id: string,
    source: MaterialSource,
    mutation: DesignTokenMutation,
    options?: RequestOptions,
  ) =>
    (
      await request.put<DesignTokenPackage>(
        `${base(target)}/${enc(id)}`,
        { ...source, ...mutation },
        options,
      )
    ).result,
  remove: async (
    target: DesignTokenTarget,
    id: string,
    mutation: DesignTokenMutation,
    options?: RequestOptions,
  ) =>
    (await request.post<boolean>(`${base(target)}/${enc(id)}/_delete`, mutation, options)).result,
}
