import { request } from '@/shared/api/client'
import { recordsOf } from '@/modules/authentication-manager-ui/utils/model'

export const positionIdentityApi = {
  positions: async () =>
    recordsOf(await request.post('/position/_query/detail/no-paging', { paging: false })),
}
