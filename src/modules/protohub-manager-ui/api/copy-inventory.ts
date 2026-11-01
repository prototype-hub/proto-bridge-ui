import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type {
  CopyInventoryTarget,
  CopyInventorySnapshot,
  CopyInventoryPage,
  CopyInventoryQuery,
  CopyInventoryInput,
  CopyInventoryMutation,
} from '../types/copy-inventory'

function base(target: CopyInventoryTarget) {
  return `/prototype-hub/versions/${encodeURIComponent(target.versionId)}/revisions/${encodeURIComponent(target.revisionId)}/pages/${encodeURIComponent(target.pageId)}/copy-inventory`
}
/** Every operation addresses an immutable manifest page, never the current revision pointer. */
export const copyInventoryApi = {
  query: async (target: CopyInventoryTarget, query: CopyInventoryQuery, options?: RequestOptions) =>
    (await request.post<CopyInventoryPage>(`${base(target)}/entries/_query`, query, options))
      .result,
  extract: async (
    target: CopyInventoryTarget,
    input: { clientRequestId: string },
    options?: RequestOptions,
  ) =>
    (await request.post<CopyInventorySnapshot>(`${base(target)}/_extract`, input, options)).result,
  create: async (
    target: CopyInventoryTarget,
    input: CopyInventoryInput,
    options?: RequestOptions,
  ) =>
    (await request.post<CopyInventoryMutation>(`${base(target)}/entries`, input, options)).result,
  update: async (
    target: CopyInventoryTarget,
    id: string,
    input: CopyInventoryInput & { expectedVersion: number },
    options?: RequestOptions,
  ) =>
    (
      await request.put<CopyInventoryMutation>(
        `${base(target)}/entries/${encodeURIComponent(id)}`,
        input,
        options,
      )
    ).result,
  remove: async (
    target: CopyInventoryTarget,
    id: string,
    input: { clientRequestId: string; expectedVersion: number },
    options?: RequestOptions,
  ) =>
    (
      await request.post<{ inventoryVersion: number; deleted: true }>(
        `${base(target)}/entries/${encodeURIComponent(id)}/_delete`,
        input,
        options,
      )
    ).result,
  export: (
    target: CopyInventoryTarget,
    input: { format: 'csv' | 'json'; expectedVersion: number },
    options?: RequestOptions,
  ) => request.postStream(`${base(target)}/_export`, input, options),
}
