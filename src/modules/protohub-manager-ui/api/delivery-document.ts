import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type { DeliveryDocument, DeliveryDocumentInput } from '../types/delivery-document'
const base = (versionId: string, revisionId: string) =>
  `/prototype-hub/versions/${encodeURIComponent(versionId)}/revisions/${encodeURIComponent(revisionId)}/delivery-document`
export const deliveryDocumentApi = {
  assemble: async (
    version: string,
    revision: string,
    input: DeliveryDocumentInput,
    options?: RequestOptions,
  ) =>
    (await request.post<DeliveryDocument>(`${base(version, revision)}/_assemble`, input, options))
      .result,
  export: (
    version: string,
    revision: string,
    format: 'markdown' | 'html',
    input: DeliveryDocumentInput,
    options?: RequestOptions,
  ) => request.postStream(`${base(version, revision)}/_export/${format}`, input, options),
}
