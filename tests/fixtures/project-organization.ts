import type { Project, ProjectListQuery } from '../../src/modules/protohub-manager-ui/types'
import {
  normalizeOrganization,
  trimProjectLabel,
  validOrganization,
} from '../../src/modules/protohub-manager-ui/utils/project-organization'

// Standalone FE contract fixture; real database scope, locking and cleanup need backend evidence.
const favorites = new Map<string, { favorite: boolean; favoriteVersion: number }>()
const receipts = new Map<string, string>()
export function resetProjectOrganization() {
  favorites.clear()
  receipts.clear()
}
export function organizationProject(project: Project, actor: string): Project {
  return {
    ...project,
    groupName: project.groupName || '',
    tags: [...(project.tags || [])],
    archivedTime: project.archivedTime ?? null,
    organizationVersion: project.organizationVersion || 0,
    ...(favorites.get(`${actor}:${project.id}`) || { favorite: false, favoriteVersion: 0 }),
  }
}
export function filterProjectOrganization(rows: Project[], query: ProjectListQuery, actor: string) {
  return rows
    .map((row) => organizationProject(row, actor))
    .filter(
      (row) =>
        (typeof query.archived !== 'boolean' || (row.archivedTime != null) === query.archived) &&
        (query.groupName == null || row.groupName === trimProjectLabel(query.groupName)) &&
        (query.tag == null || row.tags.includes(trimProjectLabel(query.tag))) &&
        (!query.favoriteOnly || row.favorite),
    )
}
export function projectOrganizationFixture(
  path: string,
  method: string,
  input: Record<string, unknown>,
  actor: string,
  rows: Project[],
  canEdit: boolean,
  now: () => number,
) {
  const reject = (status = 400) => ({ status, result: null })
  const exact = (keys: string[]) => Object.keys(input).every((key) => keys.includes(key))
  if (path === '/prototype-hub/projects/_organization/options' && method === 'POST') {
    const kind = input.kind,
      keyword = input.keyword ?? '',
      index = input.pageIndex ?? 0,
      size = input.pageSize ?? 20
    if (
      !exact(['kind', 'keyword', 'pageIndex', 'pageSize']) ||
      !['group', 'tag'].includes(String(kind)) ||
      typeof keyword !== 'string' ||
      keyword.length > 64 ||
      keyword.includes('\0') ||
      !Number.isInteger(index) ||
      Number(index) < 0 ||
      Number(index) > 10000 ||
      !Number.isInteger(size) ||
      Number(size) < 1 ||
      Number(size) > 100
    )
      return reject()
    const values = [
      ...new Set(
        rows
          .flatMap((row) => (kind === 'group' ? [row.groupName] : row.tags))
          .filter((value) => value && value.includes(trimProjectLabel(keyword))),
      ),
    ].sort()
    return {
      status: 200,
      result: {
        data: values.slice(Number(index) * Number(size), (Number(index) + 1) * Number(size)),
        total: values.length,
        pageIndex: index,
        pageSize: size,
      },
    }
  }
  const match = path.match(/^\/prototype-hub\/projects\/([^/]+)\/_(organization|favorite)$/)
  if (!match || method !== 'PUT') return undefined
  const project = rows.find((row) => row.id === decodeURIComponent(match[1]!))
  if (!project) return reject(404)
  const favorite = match[2] === 'favorite'
  if (!favorite && !canEdit) return reject(403)
  if (
    !exact(
      favorite
        ? ['favorite', 'expectedVersion', 'clientRequestId']
        : ['groupName', 'tags', 'archived', 'expectedVersion', 'clientRequestId'],
    ) ||
    !Number.isSafeInteger(input.expectedVersion) ||
    Number(input.expectedVersion) < 0 ||
    typeof input.clientRequestId !== 'string' ||
    !/^[\x20-\x7e]{1,128}$/.test(input.clientRequestId)
  )
    return reject()
  if (favorite && typeof input.favorite !== 'boolean') return reject()
  if (
    !favorite &&
    (typeof input.archived !== 'boolean' ||
      (input.groupName != null && typeof input.groupName !== 'string') ||
      !Array.isArray(input.tags) ||
      !input.tags.every((tag) => typeof tag === 'string'))
  )
    return reject()
  const draft = favorite
    ? undefined
    : {
        groupName: String(input.groupName ?? ''),
        tags: input.tags as string[],
        archived: input.archived as boolean,
      }
  if (draft && !validOrganization(draft)) return reject()
  const normalized = draft && normalizeOrganization(draft)
  const key = `${actor}:${project.id}:${match[2]}:${input.clientRequestId}`
  const fingerprint = JSON.stringify(
    favorite ? [input.favorite, input.expectedVersion] : [normalized, input.expectedVersion],
  )
  if (receipts.has(key))
    return receipts.get(key) === fingerprint
      ? { status: 200, result: organizationProject(project, actor) }
      : reject(409)
  const current = organizationProject(project, actor)
  const version = favorite ? current.favoriteVersion : current.organizationVersion
  if (version !== input.expectedVersion || version === Number.MAX_SAFE_INTEGER) return reject(409)
  if (favorite)
    favorites.set(`${actor}:${project.id}`, {
      favorite: input.favorite as boolean,
      favoriteVersion: version + 1,
    })
  else
    Object.assign(project, {
      groupName: normalized!.groupName,
      tags: normalized!.tags,
      archivedTime: normalized!.archived ? (project.archivedTime ?? now()) : null,
      organizationVersion: version + 1,
      updatedAt: now(),
    })
  receipts.set(key, fingerprint)
  return { status: 200, result: organizationProject(project, actor) }
}
