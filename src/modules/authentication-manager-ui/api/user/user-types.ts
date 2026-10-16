import { request } from '@/shared/api/client'
import { isRecord, resultOf } from '@/modules/authentication-manager-ui/utils/model'
import { normalizeUserType } from '@/modules/authentication-manager-ui/utils/user'
import type { UserType } from '@/modules/authentication-manager-ui/types/user'

export const userIdentityApi = {
  userTypes: async (): Promise<UserType[]> => {
    const result = resultOf(await request.get<unknown>('/user/detail/types'))
    const rows = Array.isArray(result)
      ? result
      : isRecord(result) && Array.isArray(result.data)
        ? result.data
        : []
    return rows.map(normalizeUserType).filter((item): item is UserType => !!item)
  },
}
