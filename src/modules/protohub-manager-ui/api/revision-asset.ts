import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type { RevisionAssetPage, RevisionAssetSelection } from '../types/revision-asset'

function base(versionId: string, revisionId: string) {
  return `/prototype-hub/versions/${encodeURIComponent(versionId)}/revisions/${encodeURIComponent(revisionId)}/assets`
}
export const revisionAssetsApi = {
  list: async (
    versionId: string,
    revisionId: string,
    query: { pageIndex: number; pageSize: number; search: string },
    options?: RequestOptions,
  ) => (await request.get<RevisionAssetPage>(base(versionId, revisionId), query, options)).result,
  download: (
    versionId: string,
    revisionId: string,
    format: 'file' | 'zip' | 'manifest',
    selection: RevisionAssetSelection,
    options?: RequestOptions,
  ) => request.postStream(`${base(versionId, revisionId)}/_${format}`, selection, options),
}
