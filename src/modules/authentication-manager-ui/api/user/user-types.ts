import { request } from '@/shared/api/client'
import { recordsOf } from '@/modules/authentication-manager-ui/utils/model'

export const userIdentityApi = {
  userTypes: async () => recordsOf(await request.get('/user/detail/types')),
}
