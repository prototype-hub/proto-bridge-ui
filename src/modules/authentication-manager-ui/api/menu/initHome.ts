import { request } from '@/shared/api/client'

import { menuReplacementOwner } from '@/modules/authentication-manager-ui/utils/menu'

/** A replacement is atomic for one explicit owner; reject mixed trees before issuing any request. */
export async function updateMenus(data: unknown) {
  const owner = menuReplacementOwner(data)
  return request.patch(`/menu/${encodeURIComponent(owner)}/_all`, data)
}
export const saveInit = () => request.post('/user/settings/init', { init: true })
export const getSystemPermission = () => request.get('/system/resources/permission')
