import { request } from '@/shared/api/client'
import { publicRequest } from '@/shared/api/public-client'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
const id = encodeURIComponent
export const authorizationApi = {
  application: (clientId: string) => publicRequest.get<Model>(`/application/${id(clientId)}/info`),
  oauth: (params: Model) => request.get<string>('/oauth2/authorize', params),
  binding: (code: string) => request.get<Model>(`/application/sso/bind-code/${id(code)}`),
  bind: (code: string) => request.post(`/application/sso/me/bind/${id(code)}`),
  tokenConfig: (key: string) => publicRequest.get<Model>(`/personal/token/${id(key)}/_config`),
  tokenRedirect: (key: string, data: Model) =>
    publicRequest.post<string>(`/personal/token/${id(key)}/_redirect`, data),
}
