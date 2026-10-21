import { ownerProjectAccess } from './project-access'
import { systemMenus } from './system-menu'
import { settings, stores, userTypes } from './system-data'
import { identityResponse } from './identity-handler'
import { systemResponse } from './system-handler'
import { resetSystem } from './system-data'
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { runtimeHtml } from './runtime'
import type {
  Project,
  Version,
  Share,
  PublicShare,
  PrototypePage,
  Capacity,
  ProjectMember,
} from '../../src/modules/protohub-manager-ui/types'
import type { ServerMenu } from '../../src/shared/auth/types'
import type { ManagedUser } from '@/modules/authentication-manager-ui/types/user'
import type { Role } from '@/modules/authentication-manager-ui/types/role'

const pages: PrototypePage[] = [
  {
    name: 'Folder',
    folder: true,
    children: [
      { name: 'Home', path: 'index.html', children: [{ name: 'Child page', path: 'child.html' }] },
    ],
  },
]
const menu = (
  id: string,
  code: string,
  name: string,
  url: string,
  actions: string[],
): ServerMenu => ({
  id,
  code,
  name,
  url,
  buttons: actions.map((action) => ({ id: action, name: action, granted: true })),
  granted: true,
})
const initialMenus: ServerMenu[] = [
  {
    ...menu('prototype-hub-root', 'prototype-hub', '原型管理', '/prototype-hub', []),
    children: [
      {
        ...menu('protohub', 'prototype-hub/Project', '原型项目', '/prototype-hub', []),
        permissions: ['prototype-hub-project', 'prototype-hub-version', 'prototype-hub-share'].map(
          (permission) => ({
            permission,
            actions: ['query', 'save', 'delete'],
          }),
        ),
      },
    ],
  },
  menu('users', 'system/User', '用户管理', '/system/user', [
    'view',
    'add',
    'update',
    'delete',
    'action',
  ]),
  menu('roles', 'system/Role', '角色管理', '/system/Role', ['view', 'add', 'update', 'delete']),
  menu('menus', 'system/Menu', '菜单管理', '/system/Menu', ['view', 'add', 'update', 'delete']),
  menu('permissions', 'system/Permission', '权限资源', '/system/Permission', ['view']),
  menu('logs', 'Log/Access', '访问日志', '/logger/access', []),
]
let menus: ServerMenu[] = []
let projects: Project[] = []
let versions: Version[] = []
let shares: Share[] = []
let users: ManagedUser[] = []
let roles: Role[] = []
let grants: ServerMenu[] = []
const roleGrants = new Map<string, ServerMenu[]>()
let counter = 10
const passwords = new Map<string, string>()
const projectMembers = new Map<string, ProjectMember[]>()
const previewSessions = new Map<
  string,
  { versionId: string; projectId: string; expiresAt: number }
>()
function revokePreviews(projectId: string, versionId?: string) {
  for (const [key, session] of previewSessions)
    if (session.projectId === projectId && (!versionId || session.versionId === versionId))
      previewSessions.delete(key)
}
const creationReceipts = new Map<string, { payload: string; result: Project | Version }>()
function reset() {
  resetSystem()
  menus = structuredClone(initialMenus)
  counter = 10
  projects = [
    {
      id: 'p1',
      name: 'Contract project',
      description: 'A contract fixture',
      createdBy: 'admin',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      ...ownerProjectAccess,
    },
  ]
  versions = [version('v1', 'p1', 'V1')]
  shares = [
    { ...share('open', 'v1', false), description: 'Public review link' },
    share('locked', 'v1', true),
    { ...share('expired', 'v1', false), expiresAt: 1 },
    { ...share('disabled', 'v1', false), enabled: false },
  ]
  passwords.clear()
  creationReceipts.clear()
  previewSessions.clear()
  projectMembers.clear()
  projectMembers.set('p1', [{ userId: 'u1', name: 'Admin', username: 'admin', role: 'owner' }])
  passwords.set('locked', 'test-share-password')
  users = [
    {
      id: 'u1',
      username: 'admin',
      name: 'Admin',
      status: 1,
      roleList: [{ id: 'ADMIN', name: 'Administrator' }],
      type: structuredClone(userTypes[1]),
      orgIdList: ['org1'],
      orgList: [{ id: 'org1', name: '研发部' }],
      positions: [],
      createTime: 1700000000000,
    },
  ]
  users.push({
    id: 'u2',
    username: 'operator',
    name: 'Operator',
    status: 1,
    type: structuredClone(userTypes[0]),
    roleList: [],
    orgIdList: [],
    positions: [],
    createTime: 1700000000001,
  })
  roles = [
    { id: 'ADMIN', name: 'Administrator', description: 'Contract role', groupId: 'default_group' },
  ]
  if (!stores['role/group'].some((group) => group.id === 'default_group'))
    stores['role/group'].unshift({ id: 'default_group', name: '默认分组' })
  grants = structuredClone(menus)
  grants.find((item) => item.id === 'users')!.accessSupport = { value: 'support' }
  grants.find((item) => item.id === 'users')!.assetAccesses = [
    { supportId: 'creator', name: '仅自己', granted: true },
    { supportId: 'all', name: '全部数据', granted: false },
  ]
  grants.push({
    id: 'personal',
    code: 'account-center',
    name: '个人中心',
    granted: true,
    buttons: [{ id: 'view', name: '查看', granted: true }],
  })
  roleGrants.clear()
}
function version(id: string, projectId: string, versionName: string): Version {
  return {
    id,
    projectId,
    versionName,
    entryFile: 'index.html',
    status: 'ready',
    createdBy: 'admin',
    createdAt: 1700000000000,
    runtimeBaseUrl: null,
    previewUrl: null,
  }
}
function share(token: string, versionId: string, passwordRequired: boolean): Share {
  return {
    id: token,
    projectId: 'p1',
    versionId,
    token,
    passwordRequired,
    enabled: true,
    createdAt: 1700000000000,
    sharePath: `/share/${token}`,
  }
}
function send(
  res: ServerResponse,
  status: number,
  result: unknown,
  message?: string,
  code?: string,
) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('X-Request-Id', 'contract-test')
  res.end(JSON.stringify({ success: status < 400, status, result, message, code }))
}
function page<T>(rows: T[]) {
  return { data: rows, total: rows.length, pageIndex: 0, pageSize: 20 }
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}
function capacity(used: number): Capacity {
  return {
    used,
    limit: 5,
    remaining: Math.max(0, 5 - used),
    overLimit: used > 5,
    canCreate: used < 5,
  }
}
function createOnce(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  payload: string,
  usage: Capacity,
  create: () => Project | Version,
) {
  const key = req.headers['idempotency-key']
  const receiptKey = typeof key === 'string' ? `${path}:${key}` : undefined
  const receipt = receiptKey ? creationReceipts.get(receiptKey) : undefined
  if (receipt) {
    if (receipt.payload === payload) send(res, 200, receipt.result)
    else send(res, 409, null, '幂等标识已用于其他创建内容，请重新发起创建')
    return
  }
  if (!usage.canCreate) {
    send(res, 409, null, '已达到免费额度，已有数据仍可查看、更新和删除')
    return
  }
  const result = create()
  if (receiptKey) creationReceipts.set(receiptKey, { payload, result })
  send(res, 200, result)
}
function multipartFields(bytes: Buffer, contentType: string) {
  const boundary = contentType
    .match(/boundary=(?:"([^"]+)"|([^;]+))/)
    ?.slice(1)
    .find(Boolean)
  const fields = new Map<string, Buffer>()
  if (!boundary) return fields
  for (const part of bytes.toString('latin1').split(`--${boundary}`).slice(1, -1)) {
    const split = part.indexOf('\r\n\r\n')
    const name = part.slice(0, split).match(/\bname="([^"]+)"/)?.[1]
    if (name && split >= 0) fields.set(name, Buffer.from(part.slice(split + 4, -2), 'latin1'))
  }
  return fields
}
async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', 'http://localhost')
  const path = url.pathname.replace(/^\/api/, '')
  const method = req.method || 'GET'
  if (url.pathname === '/__test/reset') {
    reset()
    send(res, 200, true)
    return true
  }
  if (!url.pathname.startsWith('/api/')) return false
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const bytes = Buffer.concat(chunks)
  const raw = bytes.toString()
  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    input = raw
  }
  const data = object(input)
  if (
    path.startsWith('/prototype-hub/runtime/') ||
    /^\/prototype-hub\/public\/shares\/[^/]+\/access-key\/runtime\//.test(path)
  ) {
    if (path.startsWith('/prototype-hub/runtime/')) {
      const [, , , versionId, key] = path.split('/')
      const session = previewSessions.get(key)
      if (!session || session.versionId !== versionId || session.expiresAt <= Date.now()) {
        send(res, 404, null, 'Preview unavailable')
        return true
      }
    }
    res.setHeader('Content-Type', 'text/html')
    res.end(runtimeHtml)
    return true
  }
  if (path === '/prototype-hub/public/mock-image.svg') {
    res.setHeader('Content-Type', 'image/svg+xml')
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#1677ff"/></svg>',
    )
    return true
  }
  if (path === '/system/config/front') {
    systemResponse(path, method, input, res)
    return true
  }
  if (path.startsWith('/authorize/')) {
    if (path === '/authorize/login')
      send(
        res,
        data.password === 'wrong' ? 400 : 200,
        { token: data.username === 'member' ? 'mock-member' : 'mock-admin' },
        data.password === 'wrong' ? 'Invalid credentials' : undefined,
      )
    else if (path === '/authorize/captcha/config') send(res, 200, { enabled: false })
    else if (path === '/authorize/login/configs') send(res, 200, { encrypt: { enabled: false } })
    else if (path === '/authorize/me')
      send(res, 200, {
        permissions: ['prototype-hub-project', 'prototype-hub-version', 'prototype-hub-share'].map(
          (id) => ({
            id,
            actions:
              req.headers['x-access-token'] === 'mock-member'
                ? ['query']
                : ['query', 'save', 'delete'],
          }),
        ),
      })
    else send(res, 404, null, 'Unknown auth endpoint')
    return true
  }
  const publicMatch = path.match(/^\/prototype-hub\/public\/shares\/([^/]+)(.*)$/)
  if (publicMatch) {
    if (req.headers['x-access-token']) {
      send(res, 400, null, 'Public requests must not carry management credentials')
      return true
    }
    const record = shares.find((item) => item.token === decodeURIComponent(publicMatch[1]))
    const suffix = publicMatch[2]
    if (!record || !record.enabled || (record.expiresAt && record.expiresAt < Date.now())) {
      send(res, 403, null, 'Share unavailable', 'PROTOHUB_SHARE_UNAVAILABLE')
      return true
    }
    if (suffix.endsWith('/pages')) {
      send(res, 200, pages)
      return true
    }
    const access =
      !record.passwordRequired ||
      (suffix === '/verify' && data.password === passwords.get(record.token))
    if (suffix === '/verify' && !access) {
      send(res, 403, null, 'Invalid share password', 'PROTOHUB_SHARE_PASSWORD_INVALID')
      return true
    }
    const info: PublicShare = {
      token: record.token,
      projectName: 'Contract project',
      versionName: versions.find((v) => v.id === record.versionId)?.versionName || 'V1',
      passwordRequired: record.passwordRequired,
      accessKey: access ? 'access-key' : undefined,
      runtimeBaseUrl: access
        ? `/api/prototype-hub/public/shares/${record.token}/access-key/runtime`
        : undefined,
      previewUrl: access
        ? `/api/prototype-hub/public/shares/${record.token}/access-key/runtime/index.html`
        : undefined,
    }
    send(res, 200, info)
    return true
  }
  const token = String(req.headers['x-access-token'] || '')
  if (!['mock-admin', 'mock-member'].includes(token)) {
    send(res, 401, null, 'Session expired')
    return true
  }
  const member = token === 'mock-member'
  if (
    member &&
    method !== 'GET' &&
    path !== '/menu/user-own/tree' &&
    !path.endsWith('/preview-session')
  ) {
    send(res, 403, null, 'Access denied')
    return true
  }
  if (
    identityResponse(
      { users, roles, grants, roleGrants, nextId: () => String(++counter) },
      path,
      method,
      method === 'GET' ? Object.fromEntries(url.searchParams) : input,
      res,
    )
  )
    return true
  if (systemResponse(path, method, input, res)) return true
  if (path === '/user/detail' && method === 'GET')
    send(res, 200, {
      id: member ? 'member' : 'u1',
      name: member ? 'Member' : 'Admin',
      username: member ? 'member' : 'admin',
      status: 1,
      type: structuredClone(userTypes[member ? 0 : 1]),
      ...(settings.profile && typeof settings.profile === 'object' ? settings.profile : {}),
    })
  else if (path === '/user-token/reset') send(res, 200, true)
  else if (path === '/menu/user-own/tree')
    send(
      res,
      200,
      member
        ? [
            {
              ...menus[0],
              children: menus[0].children?.map((child) => ({
                ...child,
                permissions: child.permissions?.map((permission) => ({
                  ...permission,
                  actions: ['query'],
                })),
              })),
            },
          ]
        : systemMenus(menus),
    )
  else if (path === '/menu/_all/tree') send(res, 200, systemMenus(menus))
  else if (path === '/menu/code/_validate' || /\/user\/(username|password)\/_validate/.test(path))
    send(res, 200, { passed: true })
  else if (/^\/prototype-hub\/projects\/[^/]+\/member-candidates$/.test(path)) {
    const keyword = (url.searchParams.get('keyword') || '').toLowerCase()
    send(
      res,
      200,
      users
        .filter((user) => `${user.name} ${user.username}`.toLowerCase().includes(keyword))
        .slice(0, 20)
        .map((user) => ({ userId: user.id, name: user.name, username: user.username })),
    )
  } else if (/^\/prototype-hub\/projects\/[^/]+\/members(?:\/[^/]+)?$/.test(path)) {
    const id = decodeURIComponent(path.split('/')[3])
    const userId = decodeURIComponent(path.split('/')[5] || '')
    const members = projectMembers.get(id) || []
    const existing = members.find((item) => item.userId === userId)
    if (method !== 'GET' && existing?.role === 'owner')
      send(res, 403, null, 'Owner cannot be changed')
    else if (method === 'PUT') {
      const user = users.find((item) => item.id === userId)
      if (!user || !['editor', 'viewer'].includes(String(data.role)))
        send(res, 400, null, 'Invalid member')
      else {
        const member = {
          userId,
          name: user.name,
          username: user.username,
          role: data.role as 'editor' | 'viewer',
        }
        projectMembers.set(id, [...members.filter((item) => item.userId !== userId), member])
        revokePreviews(id)
        send(res, 200, true)
      }
    } else if (method === 'DELETE') {
      projectMembers.set(
        id,
        members.filter((item) => item.userId !== userId),
      )
      revokePreviews(id)
      send(res, 200, true)
    } else send(res, 200, members)
  } else if (/^\/prototype-hub\/projects\/[^/]+\/claim$/.test(path) && method === 'POST') {
    const value = projects.find((item) => item.id === path.split('/')[3])
    if (!value?.claimRequired) send(res, 409, null, 'Claim unavailable')
    else {
      value.ownerId = String(data.userId)
      value.claimRequired = false
      send(res, 200, value)
    }
  } else if (path === '/prototype-hub/projects' && method === 'GET') send(res, 200, projects)
  else if (path === '/prototype-hub/projects/_usage' && method === 'GET')
    send(res, 200, { installationId: 'contract-installation', projects: capacity(projects.length) })
  else if (path === '/prototype-hub/versions/_usage' && method === 'GET') {
    const projectId = url.searchParams.get('projectId')
    send(res, 200, {
      projectId,
      versions: capacity(versions.filter((item) => item.projectId === projectId).length),
    })
  } else if (path === '/prototype-hub/projects' && method === 'POST') {
    const name = String(data.name).trim()
    const description = String(data.description || '').trim()
    createOnce(
      req,
      res,
      path,
      JSON.stringify([name, description, data.cover || '']),
      capacity(projects.length),
      () => {
        const value = {
          id: String(++counter),
          name,
          description,
          createdBy: 'admin',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...ownerProjectAccess,
        }
        projects.push(value)
        return value
      },
    )
  } else if (/^\/prototype-hub\/projects\/[^/]+\/versions$/.test(path) && method === 'POST') {
    const projectId = path.split('/')[3]
    const fields = multipartFields(bytes, req.headers['content-type'] || '')
    const name = fields.get('versionName')?.toString().trim() || 'Uploaded'
    const description = fields.get('description')?.toString().trim() || ''
    const fileHash = createHash('sha256')
      .update(fields.get('file') || Buffer.alloc(0))
      .digest('hex')
    createOnce(
      req,
      res,
      path,
      JSON.stringify([name, description, fileHash]),
      capacity(versions.filter((item) => item.projectId === projectId).length),
      () => {
        const value = { ...version(String(++counter), projectId, name), description }
        versions.push(value)
        return value
      },
    )
  } else if (/^\/prototype-hub\/projects\/[^/]+$/.test(path)) {
    const id = decodeURIComponent(path.split('/')[3])
    const value = projects.find((item) => item.id === id)
    if (!value) send(res, 404, null, 'Project not found')
    else if (method === 'DELETE' && versions.some((item) => item.projectId === id))
      send(
        res,
        409,
        null,
        '项目下存在版本，请先删除全部版本后再删除项目',
        'PROTOTYPE_HUB_PROJECT_HAS_VERSIONS',
      )
    else {
      if (method === 'PUT') Object.assign(value, data, { updatedAt: Date.now() })
      if (method === 'DELETE') projects = projects.filter((item) => item !== value)
      send(res, 200, value)
    }
  } else if (path === '/prototype-hub/versions')
    send(
      res,
      200,
      versions.filter((item) => item.projectId === url.searchParams.get('projectId')),
    )
  else if (/^\/prototype-hub\/versions\/[^/]+\/preview-session$/.test(path) && method === 'POST') {
    const id = path.split('/')[3]
    const key = `short-preview-${++counter}`
    const expiresAt = Date.now() + 300000
    previewSessions.set(key, {
      versionId: id,
      projectId: versions.find((item) => item.id === id)?.projectId || '',
      expiresAt,
    })
    send(res, 200, {
      runtimeBaseUrl: `/api/prototype-hub/runtime/${id}/${key}`,
      previewUrl: `/api/prototype-hub/runtime/${id}/${key}/index.html`,
      expiresAt,
    })
  } else if (/^\/prototype-hub\/versions\/[^/]+\/pages$/.test(path)) send(res, 200, pages)
  else if (/^\/prototype-hub\/versions\/[^/]+\/shares$/.test(path)) {
    const id = path.split('/')[3]
    if (method === 'POST') {
      const value = share(String(++counter), id, !!data.password)
      if (typeof data.description === 'string') value.description = data.description
      if (data.expiresAt) value.expiresAt = Number(data.expiresAt)
      shares.push(value)
      if (data.password) passwords.set(value.token, String(data.password))
      send(res, 200, value)
    } else
      send(
        res,
        200,
        shares.filter((item) => item.versionId === id),
      )
  } else if (/^\/prototype-hub\/versions\/[^/]+$/.test(path)) {
    const id = path.split('/')[3]
    const value = versions.find((item) => item.id === id)
    if (!value) send(res, 404, null, 'Version not found')
    else {
      if (method === 'PUT' || method === 'DELETE') revokePreviews(value.projectId, value.id)
      if (method === 'PUT')
        value.versionName =
          raw.match(/name="versionName"\r\n\r\n([^\r]+)/)?.[1] || value.versionName
      if (method === 'DELETE') versions = versions.filter((item) => item !== value)
      send(res, 200, value)
    }
  } else if (/^\/prototype-hub\/shares\/[^/]+\/verify-password$/.test(path) && method === 'POST') {
    const id = decodeURIComponent(path.split('/')[3])
    const value = shares.find((item) => item.id === id)
    if (!value) send(res, 404, null, 'Share not found')
    else send(res, 200, !value.passwordRequired || passwords.get(value.token) === data.password)
  } else if (/^\/prototype-hub\/shares\/[^/]+$/.test(path)) {
    const id = path.split('/')[3]
    shares = shares.filter((item) => item.id !== id)
    send(res, 200, true)
  } else if (path === '/menu' && (method === 'POST' || method === 'PATCH')) {
    const value = data as unknown as ServerMenu
    if (method === 'POST') {
      value.id = String(++counter)
      menus.push(value)
    } else Object.assign(menus.find((menu) => menu.id === value.id) || {}, value)
    send(res, 200, value)
  } else if (/^\/menu\/[^/]+$/.test(path) && method === 'GET') {
    const find = (rows: ServerMenu[]): ServerMenu | undefined => {
      for (const row of rows) {
        if (row.id === path.split('/')[2]) return row
        const nested = find(row.children || [])
        if (nested) return nested
      }
    }
    send(res, 200, find(menus) || find(systemMenus(menus)))
  } else if (/^\/menu\/[^/]+$/.test(path) && method === 'DELETE') {
    const index = menus.findIndex((menu) => menu.id === path.split('/')[2])
    if (index >= 0) menus.splice(index, 1)
    send(res, 200, true)
  } else if (path === '/logger/access/_query')
    send(
      res,
      200,
      page([
        {
          id: 'log1',
          userId: 'u1',
          ip: '127.0.0.1',
          action: '查询原型项目',
          context: { userName: 'Admin' },
          target: 'ExampleController',
          method: 'listProjects',
          httpHeaders: { Accept: 'application/json' },
          parameters: { page: 1 },
          exception: 'Example access error',
          httpMethod: 'GET',
          url: '/protohub/projects',
          requestTime: 1700000000000,
          responseTime: 1700000000010,
        },
      ]),
    )
  else send(res, 404, null, 'Unknown fixture endpoint')
  return true
}
reset()
export const mockPlugin = (): Plugin => ({
  name: 'contract-mock',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      void handle(req, res)
        .then((handled) => {
          if (!handled) next()
        })
        .catch(() => {
          send(res, 500, null, 'Fixture request failed')
        })
    })
  },
})
