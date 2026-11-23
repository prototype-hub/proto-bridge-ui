import { request } from '@/shared/api/client'
import type { RequestOptions } from '@/shared/api/types'
import { diagnosticSnapshot } from '../utils/diagnostics'

export const diagnosticsApi = {
  get: async (options?: RequestOptions) =>
    diagnosticSnapshot(
      (await request.get<unknown>('/prototype-hub/diagnostics', undefined, options)).result,
    ),
}
