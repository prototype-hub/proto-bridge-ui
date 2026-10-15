import { publicRequest } from '@/shared/api/public-client'
import type { Branding } from '@/modules/authentication-manager-ui/types/basis'

export const brandingApi = {
  front: async () =>
    (await publicRequest.get<Branding>('/system/config/front', undefined, { silent: true }))
      .result || {},
}
