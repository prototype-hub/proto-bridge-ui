import type { LoginInput, LoginConfig } from '@/modules/authentication-manager-ui/types/auth'
export type { LoginInput, LoginConfig } from '@/modules/authentication-manager-ui/types/auth'
import { request } from '@/shared/api/client'
import { publicRequest } from '@/shared/api/public-client'
import type { User, Authorization, ServerMenu } from '@/shared/auth/types'
export const sessionApi = {
  login: async (input: LoginInput) =>
    (await publicRequest.post<{ token: string }>('/authorize/login', input, { silent: true }))
      .result,
  logout: () => request.get('/user-token/reset', undefined, { silent: true }),
  user: async () => (await request.get<User>('/user/detail', undefined, { silent: true })).result,
  authorization: async () =>
    (await request.get<Authorization>('/authorize/me', undefined, { silent: true })).result,
  menus: async () =>
    (await request.post<ServerMenu[]>('/menu/user-own/tree', { paging: false }, { silent: true }))
      .result,
  config: async () =>
    (await publicRequest.get<LoginConfig>('/authorize/login/configs', undefined, { silent: true }))
      .result,
  captchaConfig: async () =>
    (
      await publicRequest.get<{ enabled: boolean }>('/authorize/captcha/config', undefined, {
        silent: true,
      })
    ).result,
  captcha: async () =>
    (
      await publicRequest.get<{ key: string; base64: string }>(
        '/authorize/captcha/image',
        { width: 160, height: 40 },
        { silent: true },
      )
    ).result,
}
