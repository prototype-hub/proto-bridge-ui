import { request } from '@/shared/api/client'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import { resultOf } from '@/modules/authentication-manager-ui/utils/model'

export const systemService = {
  upload: async (file: File) => {
    const data = new FormData()
    data.append('file', file)
    return resultOf(await request.post<Model>('/file/upload', data))
  },
}
