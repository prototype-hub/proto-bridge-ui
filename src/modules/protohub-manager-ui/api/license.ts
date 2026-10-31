import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import type { PrototypeLicenseImport, PrototypeLicenseStatus } from '../types/license'

export const licenseApi = {
  get: async (options?: RequestOptions) =>
    (await request.get<PrototypeLicenseStatus>('/prototype-hub/license', undefined, options))
      .result,
  import: async (document: string, options?: RequestOptions) =>
    (
      await request.post<PrototypeLicenseImport>(
        '/prototype-hub/license/_import',
        { document },
        options,
      )
    ).result,
}
