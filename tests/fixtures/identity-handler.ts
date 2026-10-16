import type { ServerResponse } from 'node:http'
import type { ManagedUser } from '@/modules/authentication-manager-ui/types/user'
import type { Role } from '@/modules/authentication-manager-ui/types/role'
import type { ServerMenu } from '../../src/shared/auth/types'
import { object, stores, userTypes } from './system-data'
import { identityRows, identityPage } from './identity-query'
export interface IdentityState {
  users: ManagedUser[]
  roles: Role[]
  grants: ServerMenu[]
  roleGrants: Map<string, ServerMenu[]>
  nextId: () => string
}
export function identityResponse(
  state: IdentityState,
  path: string,
  method: string,
  input: unknown,
  res: ServerResponse,
): boolean {
  const data = object(input)
  function send(result: unknown, status = 200, message?: string) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ success: status < 400, status, result, message }))
  }
  const invalid = (message: string) => send(null, 400, message)
  if (path === '/user/detail/types') send(userTypes)
  else if (path === '/user/detail/_query' || path === '/user/_query/')
    send(identityPage(identityRows(state.users, input), input))
  else if (path === '/user/detail/_create' || /^\/user\/detail\/[^/]+\/_update$/.test(path)) {
    const basic = object(data.user)
    if (
      !basic.username ||
      !basic.name ||
      !['roleIdList', 'orgIdList', 'positions'].every(
        (key) =>
          Array.isArray(data[key]) &&
          (data[key] as unknown[]).every((id) => typeof id === 'string'),
      )
    )
      invalid('User detail must use nested user and ID-array associations')
    else {
      const userId = method === 'PUT' ? decodeURIComponent(path.split('/')[3]) : state.nextId()
      let value = state.users.find((user) => user.id === userId)
      if (method === 'PUT' && (!value || data.id !== userId)) invalid('Invalid user update ID')
      else {
        if (!value) {
          value = {
            id: userId,
            username: String(basic.username),
            name: String(basic.name),
            status: 1,
            type: structuredClone(userTypes[0]),
            createTime: Date.now(),
          }
          state.users.push(value)
        }
        Object.assign(value, basic, {
          id: userId,
          roleList: (data.roleIdList as string[]).map((id) => ({
            id,
            name: state.roles.find((role) => role.id === id)?.name || id,
          })),
          orgIdList: data.orgIdList,
          orgList: (data.orgIdList as string[]).map((id) => ({
            id,
            name: stores.organization.find((org) => org.id === id)?.name || id,
          })),
          positions: (data.positions as string[]).map((id) => ({
            ...stores.position.find((position) => position.id === id),
            id,
          })),
        })
        send(value)
      }
    }
  } else if (/^\/user\/detail\/[^/]+$/.test(path))
    send(state.users.find((user) => user.id === decodeURIComponent(path.split('/')[3])))
  else if (path === '/user' && method === 'PATCH') {
    const user = state.users.find((user) => user.id === data.id)
    if (user) user.status = Number(data.status)
    send(true)
  } else if (/^\/user\/[^/]+\/password\/_reset$/.test(path)) {
    if (typeof input !== 'string') invalid('Password reset requires text/plain')
    else send(true)
  } else if (/^\/user\/[^/]+$/.test(path) && method === 'DELETE') {
    const index = state.users.findIndex(
      (user) => user.id === decodeURIComponent(path.split('/')[2]),
    )
    if (state.users[index]?.status === 1) send(null, 409, 'Disable user before deleting')
    else {
      if (index >= 0) state.users.splice(index, 1)
      send(true)
    }
  } else if (/^\/user\/(username|password)\/_validate$/.test(path)) {
    const passed =
      typeof input === 'string' &&
      (path.includes('/username/')
        ? !state.users.some((user) => user.username === input)
        : input.length >= 12 && input.length <= 128 && !!input.trim())
    send({ passed })
  } else if (/^\/organization\/[^/]+(?:\/position\/[^/]+)?\/users\/_(bind|unbind)$/.test(path)) {
    const parts = path.split('/'),
      position = parts[3] === 'position',
      id = position ? parts[4] : parts[2],
      selected = Array.isArray(input) ? input : []
    for (const user of state.users.filter((user) => selected.includes(user.id))) {
      if (position) {
        const remaining = Array.isArray(user.positions)
          ? user.positions.filter((row) => object(row).id !== id)
          : []
        user.positions = path.endsWith('_bind')
          ? [...remaining, { ...stores.position.find((row) => row.id === id), id }]
          : remaining
      } else {
        const remaining = Array.isArray(user.orgIdList)
          ? user.orgIdList.filter((value) => value !== id)
          : []
        user.orgIdList = path.endsWith('_bind') ? [...remaining, id] : remaining
        user.orgList = (user.orgIdList as string[]).map((value) => ({
          id: value,
          name: stores.organization.find((row) => row.id === value)?.name || value,
        }))
      }
    }
    send(true)
  } else if (path === '/role/group/detail/_query/tree')
    send(
      stores['role/group'].map((group) => ({
        groupId: group.id,
        groupName: group.name,
        roles: state.roles.filter((role) => role.groupId === group.id),
      })),
    )
  else if (path === '/role/group/_query/no-paging') send(identityRows(stores['role/group'], input))
  else if (path === '/role/group' && method === 'PATCH') {
    const group = stores['role/group'].find((group) => group.id === data.id)
    if (group) Object.assign(group, data)
    else stores['role/group'].push(data)
    send(data)
  } else if (/^\/role\/group\/[^/]+$/.test(path) && method === 'DELETE') {
    const rows = stores['role/group'],
      index = rows.findIndex((group) => group.id === path.split('/')[3])
    if (index >= 0) rows.splice(index, 1)
    send(true)
  } else if (path === '/role/_query/') send(identityPage(identityRows(state.roles, input), input))
  else if (path === '/role/_query/no-paging') send(identityRows(state.roles, input))
  else if (path === '/role' && method === 'POST') {
    if (!data.name || !data.groupId || data.id)
      invalid('Roles require name/group and a generated ID')
    else {
      const value: Role = { ...data, id: `role-${state.nextId()}`, name: String(data.name) }
      state.roles.push(value)
      send(value)
    }
  } else if (path === '/role' && method === 'PATCH') {
    const value = state.roles.find((role) => role.id === data.id)
    if (value) Object.assign(value, data)
    send(value)
  } else if (/^\/role\/[^/]+$/.test(path)) {
    const index = state.roles.findIndex((role) => role.id === path.split('/')[2])
    const value = state.roles[index]
    if (method === 'DELETE' && index >= 0) state.roles.splice(index, 1)
    send(value)
  } else if (/^\/role\/[^/]+\/users\/_(bind|unbind)$/.test(path)) {
    const roleId = path.split('/')[2],
      ids = Array.isArray(input) ? input : []
    for (const user of state.users.filter((user) => ids.includes(user.id))) {
      const remaining = (user.roleList || []).filter((role) => role.id !== roleId)
      user.roleList = path.endsWith('_bind')
        ? [
            ...remaining,
            { id: roleId, name: state.roles.find((role) => role.id === roleId)?.name || roleId },
          ]
        : remaining
    }
    send(true)
  } else if (/^\/menu\/role\/[^/]+\/_grant\/tree$/.test(path))
    send(state.roleGrants.get(path.split('/')[3]) || state.grants)
  else if (/^\/menu\/role\/[^/]+\/_grant$/.test(path)) {
    if (!Array.isArray(data.menus)) invalid('Role grants require menus[]')
    else {
      const selected = data.menus as ServerMenu[]
      state.roleGrants.set(
        path.split('/')[3],
        state.grants.map(
          (menu) =>
            selected.find((row) => row.id === menu.id) || {
              ...menu,
              granted: false,
              buttons: menu.buttons?.map((button) => ({ ...button, granted: false })),
            },
        ),
      )
      send(true)
    }
  } else if (path === '/permission/id/_validate' && method === 'GET') {
    const passed = !!data.id && !stores.permission.some((resource) => resource.id === data.id)
    send({ passed, reason: passed ? undefined : 'Invalid or duplicate permission ID' })
  } else if (path === '/permission/_query/')
    send(identityPage(identityRows(stores.permission, input), input))
  else if (path === '/permission/_query/no-paging') send(identityRows(stores.permission, input))
  else if (path === '/permission' && ['POST', 'PATCH'].includes(method)) {
    for (const item of Array.isArray(input) ? input : [input]) {
      const value = object(item),
        current = stores.permission.find((resource) => resource.id === value.id)
      if (current) Object.assign(current, value)
      else stores.permission.push({ ...value, status: value.status ?? 1 })
    }
    send(input)
  } else if (/^\/permission\/[^/]+$/.test(path) && method === 'DELETE') {
    const rows = stores.permission,
      index = rows.findIndex((resource) => resource.id === path.split('/')[2])
    if (rows[index]?.status === 1) send(null, 409, 'Disable permission before deleting')
    else {
      if (index >= 0) rows.splice(index, 1)
      send(true)
    }
  } else return false
  return true
}
