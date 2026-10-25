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
import { comparisonIds, comparisonPages, fixtureComparison } from './comparison'
import { fixtureQuality } from './quality'
import { threadResponse } from './review-thread'
import { invitationManagement } from './review-invitation'
import {
  reviewEnabled,
  reviewUnverifiedAllowed,
  reviewPolicy,
  reviewResponse,
  resetReview,
} from './review'
import type {
  PrototypeListQuery,
  Project,
  Version,
  Revision,
  Share,
  PublicShare,
  PrototypePage,
  Capacity,
  ProjectMember,
} from '../../src/modules/protohub-manager-ui/types'
import type { ServerMenu } from '../../src/shared/auth/types'
import type { ManagedUser } from '@/modules/authentication-manager-ui/types/user'
import type { Role } from '@/modules/authentication-manager-ui/types/role'

/** Fixtures model typed paging only; server authorization is exercised by live/integration tests. */
function prototypePage<T extends Project | Version>(rows: T[], query: PrototypeListQuery) {
  const pageIndex = query.pageIndex ?? 0
  const pageSize = query.pageSize ?? 20
  const keyword = query.keyword?.trim() || ''
  const name = (row: T) => ('name' in row ? row.name : row.versionName)
  const filtered = rows.filter((row) => name(row).includes(keyword))
  const order = query.sortOrder === 'asc' ? 1 : -1
  filtered.sort((left, right) => {
    const value =
      query.sortBy === 'name'
        ? name(left).localeCompare(name(right))
        : left.createdAt - right.createdAt
    return value * order || left.id.localeCompare(right.id)
  })
  return {
    data: filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    total: filtered.length,
    pageIndex,
    pageSize,
  }
}

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
  owner: 'iot',
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
      {
        ...menu(
          'prototype-hub-recycle',
          'prototype-hub/Recycle',
          '回收站',
          '/prototype-hub/recycle-bin',
          [],
        ),
        permissions: [],
        buttons: [
          {
            id: 'queryProjects',
            name: '查询项目回收站',
            permissions: [{ permission: 'prototype-hub-project', actions: ['query'] }],
            granted: true,
          },
          {
            id: 'queryVersions',
            name: '查询版本回收站',
            permissions: [{ permission: 'prototype-hub-version', actions: ['query'] }],
            granted: true,
          },
          {
            id: 'restore',
            name: '恢复项目',
            permissions: [{ permission: 'prototype-hub-project', actions: ['query', 'save'] }],
            granted: true,
          },
          {
            id: 'restoreVersion',
            name: '恢复版本',
            permissions: [{ permission: 'prototype-hub-version', actions: ['query', 'save'] }],
            granted: true,
          },
        ],
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
// Test clock and cleanup are fixture-only; browser time never decides server restoration rights.
const retentionMs = 30 * 24 * 60 * 60 * 1000
let fixtureTime: number | undefined
const now = () => fixtureTime ?? Date.now()
const retained = (tombstones: Map<string, number>, id: string) => {
  const deletedTime = tombstones.get(id)
  return deletedTime !== undefined && deletedTime > now() - retentionMs
}
// Retain fixture lineage while normal endpoints expose only active resources.
const deletedProjects = new Map<string, number>()
const deletedVersions = new Map<string, number>()
const activeProject = (id: string) =>
  projects.find((item) => item.id === id && !deletedProjects.has(id))
const activeVersion = (id: string) =>
  versions.find(
    (item) => item.id === id && !deletedVersions.has(id) && activeProject(item.projectId),
  )
const revisions = new Map<string, Revision>()
const shareRevisions = new Map<string, string>()
let users: ManagedUser[] = []
let roles: Role[] = []
let grants: ServerMenu[] = []
const roleGrants = new Map<string, ServerMenu[]>()
let counter = 10
const passwords = new Map<string, string>()
const projectMembers = new Map<string, ProjectMember[]>()
const previewSessions = new Map<
  string,
  { versionId: string; revisionId: string; projectId: string; expiresAt: number }
>()
function revokePreviews(projectId: string, versionId?: string) {
  for (const [key, session] of previewSessions)
    if (session.projectId === projectId && (!versionId || session.versionId === versionId))
      previewSessions.delete(key)
}
/** Deleting a resource terminally revokes shares without erasing their retained records. */
function revokeResourceAccess(projectId: string, versionId?: string) {
  revokePreviews(projectId, versionId)
  for (const share of shares) {
    if (share.projectId !== projectId || (versionId && share.versionId !== versionId)) continue
    if (!share.revoked) share.configVersion++
    share.enabled = false
    share.revoked = true
  }
}
const creationReceipts = new Map<string, { payload: string; result: Project | Version }>()
const creationReceiptKey = (req: IncomingMessage, path: string) => {
  const key = req.headers['idempotency-key']
  return typeof key === 'string' ? `${req.headers['x-access-token']}:${path}:${key}` : undefined
}
function reset() {
  resetReview()
  resetSystem()
  menus = structuredClone(initialMenus)
  counter = 10
  fixtureTime = undefined
  deletedProjects.clear()
  deletedVersions.clear()
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
  revisions.clear()
  shareRevisions.clear()
  versions = [version('v1', 'p1', 'V1')]
  saveRevision(versions[0]!, 'initial content')
  shares = [
    { ...share('open', 'v1', false), description: 'Public review link' },
    share('locked', 'v1', true),
    { ...share('expired', 'v1', false), expiresAt: 1 },
    { ...share('disabled', 'v1', false), enabled: false },
  ]
  for (const record of shares) shareRevisions.set(record.token, 'r-v1')
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
    currentRevisionId: `r-${id}`,
    revisionId: `r-${id}`,
    revisionCount: 1,
    migrationRequired: false,
  }
}
function saveRevision(value: Version, content: string | Buffer) {
  const revision: Revision = {
    id: value.currentRevisionId!,
    projectId: value.projectId,
    versionId: value.id,
    versionName: value.versionName,
    description: value.description,
    entryFile: value.entryFile,
    manifestSha256: createHash('sha256').update(content).digest('hex'),
    fileCount: 3,
    totalBytes: Buffer.byteLength(content),
    createdBy: value.createdBy,
    createdAt: now(),
  }
  revisions.set(revision.id, revision)
}
function revisionPages(revisionId: string): PrototypePage[] {
  if (comparisonIds.some((id) => id === revisionId)) return comparisonPages(revisionId)
  const decorate = (items: PrototypePage[]): PrototypePage[] =>
    items.map((item) => ({
      ...item,
      pageId: item.folder
        ? null
        : createHash('sha256').update(`${revisionId}:${item.path}`).digest('hex'),
      children: item.children ? decorate(item.children) : undefined,
    }))
  return decorate(pages)
}
function share(token: string, versionId: string, passwordRequired: boolean): Share {
  return {
    revisionMode: 'fixed',
    revisionId: `r-${versionId}`,
    revoked: false,
    configVersion: 1,
    id: token,
    projectId: activeVersion(versionId)?.projectId || 'p1',
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
  const receiptKey = creationReceiptKey(req, path)
  const receipt = receiptKey ? creationReceipts.get(receiptKey) : undefined
  if (receipt) {
    const original = receipt.result
    const current =
      'projectId' in original ? activeVersion(original.id) : activeProject(original.id)
    // A retained creation receipt cannot resurrect a deleted resource or be reused for a new ID.
    if (!current) {
      send(res, 409, null, '创建结果已删除，请重新发起创建', 'PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT')
      return
    }
    if (receipt.payload === payload) {
      send(
        res,
        200,
        'currentRevisionId' in current
          ? {
              ...original,
              currentRevisionId: current.currentRevisionId,
              revisionCount: current.revisionCount,
            }
          : original,
      )
    } else send(res, 409, null, '幂等标识已用于其他创建内容，请重新发起创建')
    return
  }
  if (!usage.canCreate) {
    send(res, 409, null, '已达到免费额度，已有数据仍可查看、更新和删除')
    return
  }
  const result = create()
  if (receiptKey) creationReceipts.set(receiptKey, { payload, result: structuredClone(result) })
  send(res, 200, result)
}
/** Models committed graph removal, not filesystem safety or database transactions. */
function purgeExpired() {
  const expiredVersions = new Set(
    versions
      .filter((item) => deletedVersions.has(item.id) && !retained(deletedVersions, item.id))
      .map((item) => item.id),
  )
  versions = versions.filter((item) => !expiredVersions.has(item.id))
  // Every raw child protects its parent, including a younger tombstone or an active row.
  const expiredProjects = new Set(
    projects
      .filter(
        (item) =>
          deletedProjects.has(item.id) &&
          !retained(deletedProjects, item.id) &&
          !versions.some((child) => child.projectId === item.id),
      )
      .map((item) => item.id),
  )
  projects = projects.filter((item) => !expiredProjects.has(item.id))
  for (const id of expiredVersions) deletedVersions.delete(id)
  for (const id of expiredProjects) {
    deletedProjects.delete(id)
    projectMembers.delete(id)
  }
  for (const [id, revision] of revisions)
    if (expiredVersions.has(revision.versionId)) revisions.delete(id)
  for (const [id, session] of previewSessions)
    if (expiredVersions.has(session.versionId) || expiredProjects.has(session.projectId))
      previewSessions.delete(id)
  shares = shares.filter((item) => {
    if (!expiredVersions.has(item.versionId) && !expiredProjects.has(item.projectId)) return true
    passwords.delete(item.token)
    shareRevisions.delete(item.token)
    return false
  })
  for (const [key, receipt] of creationReceipts) {
    const value = receipt.result
    if ('projectId' in value ? expiredVersions.has(value.id) : expiredProjects.has(value.id))
      creationReceipts.delete(key)
  }
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
export async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', 'http://localhost')
  const path = url.pathname.replace(/^\/api/, '')
  const method = req.method || 'GET'
  if (url.pathname === '/__test/reset') {
    reset()
    send(res, 200, true)
    return true
  }
  const clockControl = method === 'POST' && url.pathname === '/__test/clock'
  const cleanupControl = method === 'POST' && url.pathname === '/__test/purge-expired'
  const comparisonControl = method === 'POST' && url.pathname === '/__test/comparison'
  if (!url.pathname.startsWith('/api/') && !clockControl && !cleanupControl && !comparisonControl)
    return false
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
  if (comparisonControl) {
    const value = versions[0]!
    const original = revisions.get(value.currentRevisionId!)!
    for (let index = 0; index < 52; index++) {
      const revision = { ...original, id: `history-${index}`, createdAt: now() + index + 10 }
      revisions.set(revision.id, revision)
    }
    for (const [index, id] of comparisonIds.entries())
      revisions.set(id, {
        ...original,
        id,
        versionName: index ? 'Right revision' : 'Left revision',
        createdAt: now() - 1000 + index,
      })
    value.currentRevisionId = comparisonIds[1]
    value.revisionCount = revisions.size
    send(res, 200, true)
    return true
  }
  if (clockControl) {
    if (typeof data.now !== 'number' || !Number.isSafeInteger(data.now) || data.now < 0)
      send(res, 400, null, 'Invalid fixture clock')
    else {
      fixtureTime = data.now
      send(res, 200, fixtureTime)
    }
    return true
  }
  if (cleanupControl) {
    purgeExpired()
    send(res, 200, true)
    return true
  }
  if (path.startsWith('/prototype-hub/runtime/')) {
    const [, , , versionId, key] = path.split('/')
    const session = previewSessions.get(key)
    if (
      !session ||
      session.versionId !== versionId ||
      session.expiresAt <= now() ||
      !activeVersion(session.versionId)
    ) {
      send(res, 403, null, 'Preview unavailable')
      return true
    }
    res.setHeader('Content-Type', 'text/html')
    res.end(
      session.revisionId.startsWith('compare-')
        ? `<!doctype html><h1>${session.revisionId === 'compare-left' ? 'Left revision' : 'Right revision'}</h1><p>${path.split('/').slice(5).join('/')}</p>`
        : runtimeHtml,
    )
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
    if (
      !record ||
      !activeProject(record.projectId) ||
      activeVersion(record.versionId)?.projectId !== record.projectId ||
      !record.enabled ||
      record.revoked ||
      (record.expiresAt != null && record.expiresAt <= now())
    ) {
      send(res, 404, null, 'Share unavailable', 'PROTOHUB_SHARE_UNAVAILABLE')
      return true
    }
    const canonical = suffix.match(/^\/([^/]+)\/revisions\/([^/]+)\/(pages|runtime)(?:\/.*)?$/)
    if (canonical) {
      const rid = decodeURIComponent(canonical[2])
      const revision = revisions.get(rid)
      if (
        canonical[1] !== `access-${record.configVersion}-${rid}` ||
        revision?.versionId !== record.versionId ||
        (record.revisionMode !== 'latest' && rid !== record.revisionId)
      ) {
        send(res, 404, null, 'Grant unavailable')
        return true
      }
      if (canonical[3] === 'pages') send(res, 200, revisionPages(rid))
      else {
        res.setHeader('Content-Type', 'text/html')
        res.end(runtimeHtml)
      }
      return true
    }
    if (suffix !== '' && suffix !== '/verify' && !suffix.startsWith('/review/')) {
      send(res, 404, null, 'Unknown share endpoint')
      return true
    }
    const rid =
      record.revisionMode === 'latest'
        ? versions.find((version) => version.id === record.versionId)?.currentRevisionId || ''
        : record.revisionId || shareRevisions.get(record.token) || ''
    const grant = `access-${record.configVersion}-${rid}`
    const grantBase = `/api/prototype-hub/public/shares/${record.token}/${grant}/revisions/${rid}`
    if (reviewResponse(req, res, record, data, suffix, rid, grant, send, revisionPages(rid)))
      return true
    const access =
      !record.passwordRequired ||
      (suffix === '/verify' && data.password === passwords.get(record.token))
    if (suffix === '/verify' && !access) {
      send(res, 403, null, 'Invalid share password', 'PROTOHUB_SHARE_PASSWORD_INVALID')
      return true
    }
    const info: PublicShare = {
      reviewEnabled: access && reviewEnabled(record.id),
      reviewAvailable: access && reviewEnabled(record.id),
      reviewUnverifiedAllowed: access && reviewUnverifiedAllowed(record.id),
      token: record.token,
      revisionId: rid,
      revisionMode: record.revisionMode,
      pagesUrl: access ? `${grantBase}/pages` : undefined,
      projectName: 'Contract project',
      versionName: revisions.get(rid)?.versionName || 'V1',
      passwordRequired: record.passwordRequired,
      accessKey: access ? grant : undefined,
      runtimeBaseUrl: access ? `${grantBase}/runtime` : undefined,
      previewUrl: access ? `${grantBase}/runtime/index.html` : undefined,
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
  // Recovery is a separate scoped API, never an include-deleted flag on ordinary reads.
  if (method === 'POST' && path === '/prototype-hub/projects/_deleted/_query') {
    send(
      res,
      200,
      prototypePage(
        member
          ? []
          : projects
              .filter((item) => retained(deletedProjects, item.id))
              .map((item) => ({ ...item, deletedTime: deletedProjects.get(item.id) })),
        data,
      ),
    )
    return true
  }
  if (method === 'POST' && path === '/prototype-hub/versions/_deleted/_query') {
    const projectId = url.searchParams.get('projectId')
    if (projectId && !activeProject(projectId)) send(res, 404, null, 'Resource unavailable')
    else if (member && projectId) send(res, 403, null, 'Access denied')
    else
      send(
        res,
        200,
        prototypePage(
          versions
            .filter(
              (item) =>
                !member &&
                (!projectId || item.projectId === projectId) &&
                activeProject(item.projectId) &&
                retained(deletedVersions, item.id),
            )
            .map((item) => ({ ...item, deletedTime: deletedVersions.get(item.id) })),
          data,
        ),
      )
    return true
  }
  const restore =
    method === 'POST' && path.match(/^\/prototype-hub\/(projects|versions)\/([^/]+)\/_restore$/)
  if (restore) {
    const id = decodeURIComponent(restore[2]!)
    const isProject = restore[1] === 'projects'
    const value = isProject
      ? projects.find((item) => item.id === id)
      : versions.find((item) => item.id === id)
    const tombstones = isProject ? deletedProjects : deletedVersions
    const projectId = value && 'projectId' in value ? value.projectId : id
    const used = isProject
      ? projects.filter((item) => activeProject(item.id)).length
      : versions.filter((item) => item.projectId === projectId && activeVersion(item.id)).length
    if (!value || (!isProject && !activeProject(projectId)))
      send(res, 404, null, 'Resource unavailable')
    else if (member) send(res, 403, null, 'Access denied')
    else if (!tombstones.has(id))
      send(res, 409, null, 'Resource already active', 'PROTOTYPE_HUB_RESOURCE_ACTIVE')
    else if (!retained(tombstones, id)) send(res, 404, null, 'Resource unavailable')
    else if (used >= 5)
      send(
        res,
        409,
        null,
        '已达到免费额度',
        isProject ? 'PROTOTYPE_HUB_PROJECT_LIMIT_REACHED' : 'PROTOTYPE_HUB_VERSION_LIMIT_REACHED',
      )
    else {
      tombstones.delete(id)
      // Retained shares stay revoked and preview sessions are never recreated.
      send(res, 200, { ...value, deletedTime: null })
    }
    return true
  }
  // Apply retained-resource visibility before every nested read or mutation, including uploads.
  const projectScope = path.match(/^\/prototype-hub\/projects\/([^/]+)(?:\/|$)/)?.[1]
  const versionScope = path.match(/^\/prototype-hub\/versions\/([^/]+)(?:\/|$)/)?.[1]
  const shareScope = path.match(/^\/prototype-hub\/shares\/([^/]+)(?:\/|$)/)?.[1]
  const scopedShare =
    shareScope && shares.find((item) => item.id === decodeURIComponent(shareScope))
  const projectQuery =
    (path === '/prototype-hub/versions' ||
      path === '/prototype-hub/versions/_query' ||
      path === '/prototype-hub/versions/_usage') &&
    url.searchParams.get('projectId')
  const receiptKey = creationReceiptKey(req, path)
  const previousCreation = receiptKey && creationReceipts.get(receiptKey)
  // Only the original actor's exact retained receipt can report a replay conflict before parent lookup.
  if (
    method === 'POST' &&
    /^\/prototype-hub\/projects\/[^/]+\/versions$/.test(path) &&
    projectScope &&
    !activeProject(decodeURIComponent(projectScope)) &&
    previousCreation &&
    'projectId' in previousCreation.result &&
    previousCreation.result.projectId === decodeURIComponent(projectScope)
  ) {
    send(res, 409, null, '创建结果已删除，请重新发起创建', 'PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT')
    return true
  }
  if (
    (projectScope &&
      !['_query', '_usage', '_ownership-migration'].includes(projectScope) &&
      !activeProject(decodeURIComponent(projectScope))) ||
    (versionScope &&
      !['_query', '_usage'].includes(versionScope) &&
      !activeVersion(decodeURIComponent(versionScope))) ||
    (projectQuery && !activeProject(projectQuery)) ||
    (shareScope && (!scopedShare || !activeVersion(scopedShare.versionId)))
  ) {
    send(res, 404, null, 'Resource unavailable')
    return true
  }
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
  } else if (path === '/prototype-hub/projects/_query' && method === 'POST')
    send(
      res,
      200,
      prototypePage(
        projects.filter((item) => activeProject(item.id)),
        data,
      ),
    )
  else if (path === '/prototype-hub/versions/_query' && method === 'POST')
    send(
      res,
      200,
      prototypePage(
        versions.filter(
          (item) => item.projectId === url.searchParams.get('projectId') && activeVersion(item.id),
        ),
        data,
      ),
    )
  else if (path === '/prototype-hub/projects' && method === 'GET')
    send(
      res,
      200,
      projects.filter((item) => activeProject(item.id)),
    )
  else if (path === '/prototype-hub/projects/_usage' && method === 'GET')
    send(res, 200, {
      installationId: 'contract-installation',
      projects: capacity(projects.filter((item) => activeProject(item.id)).length),
    })
  else if (path === '/prototype-hub/versions/_usage' && method === 'GET') {
    const projectId = url.searchParams.get('projectId')
    send(res, 200, {
      projectId,
      versions: capacity(
        versions.filter((item) => item.projectId === projectId && activeVersion(item.id)).length,
      ),
    })
  } else if (path === '/prototype-hub/projects' && method === 'POST') {
    const name = String(data.name).trim()
    const description = String(data.description || '').trim()
    createOnce(
      req,
      res,
      path,
      JSON.stringify([name, description, data.cover || '']),
      capacity(projects.filter((item) => activeProject(item.id)).length),
      () => {
        const value = {
          id: String(++counter),
          name,
          description,
          createdBy: 'admin',
          createdAt: now(),
          updatedAt: now(),
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
      capacity(
        versions.filter((item) => item.projectId === projectId && activeVersion(item.id)).length,
      ),
      () => {
        const value = { ...version(String(++counter), projectId, name), description }
        versions.push(value)
        saveRevision(value, fields.get('file') || Buffer.alloc(0))
        return value
      },
    )
  } else if (/^\/prototype-hub\/projects\/[^/]+$/.test(path)) {
    const id = decodeURIComponent(path.split('/')[3])
    const value = projects.find((item) => item.id === id)
    if (!value) send(res, 404, null, 'Project not found')
    else if (
      method === 'DELETE' &&
      versions.some((item) => item.projectId === id && activeVersion(item.id))
    )
      send(
        res,
        409,
        null,
        '项目下存在版本，请先删除全部版本后再删除项目',
        'PROTOTYPE_HUB_PROJECT_HAS_VERSIONS',
      )
    else {
      if (method === 'PUT') Object.assign(value, data, { updatedAt: now() })
      if (method === 'DELETE') {
        deletedProjects.set(id, now())
        revokeResourceAccess(id)
      }
      send(res, 200, value)
    }
  } else if (path === '/prototype-hub/versions')
    send(
      res,
      200,
      versions.filter(
        (item) => item.projectId === url.searchParams.get('projectId') && activeVersion(item.id),
      ),
    )
  else if (/^\/prototype-hub\/versions\/[^/]+\/revisions\/[^/]+\/quality$/.test(path)) {
    const id = decodeURIComponent(path.split('/')[3]!)
    const rid = decodeURIComponent(path.split('/')[5]!)
    const value = activeVersion(id)
    const revision = revisions.get(rid)
    if (!value || !revision || revision.versionId !== id)
      send(res, 404, null, 'Revision unavailable')
    else send(res, 200, fixtureQuality(revision))
  } else if (/^\/prototype-hub\/versions\/[^/]+\/revisions\/_compare$/.test(path)) {
    const id = decodeURIComponent(path.split('/')[3]!)
    const value = activeVersion(id)
    const left = revisions.get(url.searchParams.get('leftRevisionId') || '')
    const right = revisions.get(url.searchParams.get('rightRevisionId') || '')
    if (!value || !left || !right || left.versionId !== id || right.versionId !== id)
      send(res, 404, null, 'Revision unavailable')
    else send(res, 200, fixtureComparison(left, right, url.searchParams))
  } else if (
    /^\/prototype-hub\/versions\/[^/]+\/(?:current-revision|revisions(?:\/[^/]+(?:\/(?:pages|preview-session))?)?)$/.test(
      path,
    )
  ) {
    const [, , , id, action, revisionId, suffix] = path.split('/')
    const value = versions.find((item) => item.id === id)
    const revision = revisions.get(
      action === 'current-revision' ? value?.currentRevisionId || '' : revisionId || '',
    )
    if (!value) send(res, 404, null, 'Version not found')
    else if (action === 'revisions' && !revisionId) {
      const all = [...revisions.values()]
        .filter((item) => item.versionId === id)
        .sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id))
      const after = url.searchParams.get('after')
      const start = after ? all.findIndex((item) => item.id === after) + 1 : 0
      send(res, 200, all.slice(start, start + Number(url.searchParams.get('limit') || 50)))
    } else if (!revision || revision.versionId !== id) send(res, 404, null, 'Revision not found')
    else if (suffix === 'pages') send(res, 200, revisionPages(revision.id))
    else if (suffix === 'preview-session' && method === 'POST') {
      const key = `short-preview-${++counter}`
      const expiresAt = now() + 300000
      previewSessions.set(key, {
        versionId: id!,
        revisionId: revision.id,
        projectId: value.projectId,
        expiresAt,
      })
      send(res, 200, {
        runtimeBaseUrl: `/api/prototype-hub/runtime/${id}/${key}`,
        previewUrl: `/api/prototype-hub/runtime/${id}/${key}/${revision.entryFile}`,
        expiresAt,
      })
    } else send(res, 200, revision)
  } else if (/^\/prototype-hub\/versions\/[^/]+\/shares$/.test(path)) {
    const id = path.split('/')[3]
    if (method === 'POST') {
      const value = share(String(++counter), id, !!data.password)
      value.revisionMode = data.revisionMode === 'latest' ? 'latest' : 'fixed'
      value.revisionId =
        value.revisionMode === 'latest'
          ? null
          : versions.find((item) => item.id === id)?.currentRevisionId || null
      if (typeof data.description === 'string') value.description = data.description
      if (data.expiresAt) value.expiresAt = Number(data.expiresAt)
      shares.push(value)
      shareRevisions.set(
        value.token,
        versions.find((item) => item.id === id)?.currentRevisionId || '',
      )
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
      if (method === 'PUT') {
        const fields = multipartFields(bytes, req.headers['content-type'] || '')
        const expected = fields.get('expectedRevisionId')?.toString()
        if (expected && expected !== value.currentRevisionId) {
          send(res, 409, null, 'Version has a newer revision', 'PROTOTYPE_HUB_VERSION_CONFLICT')
          return true
        }
        value.versionName = fields.get('versionName')?.toString() || value.versionName
        value.description = fields.get('description')?.toString() || ''
        value.currentRevisionId = `r-${++counter}`
        value.revisionId = value.currentRevisionId
        value.revisionCount++
        saveRevision(value, fields.get('file') || Buffer.alloc(0))
      }
      if (method === 'DELETE') {
        deletedVersions.set(id, now())
        revokeResourceAccess(value.projectId, id)
      }
      send(res, 200, value)
    }
  } else if (/^\/prototype-hub\/versions\/[^/]+\/review-threads(?:\/.*)?$/.test(path)) {
    const versionId = decodeURIComponent(path.split('/')[3]!),
      revision = revisions.get(String(data.revisionId))
    if (!activeVersion(versionId) || revision?.versionId !== versionId)
      send(res, 404, null, 'Feedback unavailable')
    else
      threadResponse(
        res,
        versionId,
        revisionPages(revision.id),
        data,
        path.split('/review-threads')[1] || '',
        method,
        send,
      )
  } else if (/^\/prototype-hub\/shares\/[^/]+\/review-invitations(?:\/.*)?$/.test(path)) {
    const value = shares.find((item) => item.id === decodeURIComponent(path.split('/')[3]!))
    if (!value) send(res, 404, null, 'Share unavailable')
    else invitationManagement(res, value, path, method, data, reviewEnabled(value.id), send)
  } else if (/^\/prototype-hub\/shares\/[^/]+\/review$/.test(path)) {
    const id = decodeURIComponent(path.split('/')[3]!)
    const value = shares.find((item) => item.id === id)
    if (!value) send(res, 404, null, 'Share unavailable')
    else if (method === 'GET') send(res, 200, reviewPolicy(value))
    else if (value.revoked) send(res, 404, null, 'Share unavailable')
    else if (method === 'PUT' && data.expectedVersion === value.configVersion) {
      const policy = reviewPolicy(value, data)
      send(res, 200, policy)
    } else send(res, 409, null, 'Share changed')
  } else if (/^\/prototype-hub\/shares\/[^/]+\/verify-password$/.test(path) && method === 'POST') {
    const id = decodeURIComponent(path.split('/')[3])
    const value = shares.find((item) => item.id === id)
    if (!value) send(res, 404, null, 'Share not found')
    else send(res, 200, !value.passwordRequired || passwords.get(value.token) === data.password)
  } else if (/^\/prototype-hub\/shares\/[^/]+(?:\/(enabled|revoke|rotate-link))?$/.test(path)) {
    const [, , , id, action] = path.split('/')
    const value = shares.find((item) => item.id === id)
    if (!value) send(res, 404, null, 'Share unavailable')
    else if (method === 'DELETE') {
      shares = shares.filter((item) => item.id !== id)
      send(res, 200, true)
    } else if (value.revoked || data.expectedVersion !== value.configVersion) {
      send(res, 409, null, 'Share changed', 'PROTOTYPE_HUB_SHARE_CONFIG_CONFLICT')
    } else {
      value.configVersion++
      if (action === 'enabled') value.enabled = data.enabled === true
      else if (action === 'revoke') value.revoked = true
      else if (action === 'rotate-link') {
        const password = passwords.get(value.token)
        passwords.delete(value.token)
        shareRevisions.delete(value.token)
        value.token = `rotated-${++counter}`
        value.sharePath = `/share/${value.token}`
        if (password !== undefined) passwords.set(value.token, password)
      } else {
        value.description = typeof data.description === 'string' ? data.description : null
        value.expiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : null
        value.revisionMode = data.revisionMode === 'latest' ? 'latest' : 'fixed'
        value.revisionId =
          value.revisionMode === 'latest' ? null : String(data.revisionId || value.revisionId || '')
        if (data.passwordAction === 'remove') {
          value.passwordRequired = false
          passwords.delete(value.token)
        }
        if (data.passwordAction === 'replace') {
          value.passwordRequired = true
          passwords.set(value.token, String(data.password))
        }
      }
      send(res, 200, value)
    }
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
