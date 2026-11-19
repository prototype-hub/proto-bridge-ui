import type { ServerResponse } from 'node:http'
import type {
  PageDelivery,
  PageDeliveryState,
  PrototypePage,
  Revision,
} from '../../src/modules/protohub-manager-ui/types'

// UI/wire fixture only; live tests own transaction and access guarantees.
const rows = new Map<string, PageDelivery>()
const receipts = new Map<string, string>()
export function resetPageDeliveries() {
  rows.clear()
  receipts.clear()
}
type Send = (
  res: ServerResponse,
  status: number,
  result: unknown,
  message?: string,
  code?: string,
) => void
export function pageDeliveryResponse(
  path: string,
  method: string,
  data: Record<string, unknown>,
  readonly: boolean,
  actor: string,
  revisions: Map<string, Revision>,
  pages: (id: string) => PrototypePage[],
  res: ServerResponse,
  send: Send,
  now: number,
) {
  const match = path.match(/^\/prototype-hub\/versions\/([^/]+)\/page-deliveries\/([^/]+)$/)
  if (!match) return false
  const versionId = decodeURIComponent(match[1]!),
    pageId = decodeURIComponent(match[2]!),
    revision = revisions.get(String(data.revisionId))
  if (!revision || revision.versionId !== versionId) {
    send(res, 404, null, 'Revision unavailable')
    return true
  }
  const pager = <T>(all: T[]) => {
    const pageIndex = Number(data.pageIndex || 0),
      pageSize = Number(data.pageSize || 20)
    return {
      data: all.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      total: all.length,
      pageIndex,
      pageSize,
    }
  }
  if (pageId === '_query' && method === 'POST') {
    const all = [...rows.values()]
      .filter(
        (row) =>
          row.versionId === versionId &&
          row.revisionId === revision.id &&
          (!data.state || row.state === data.state),
      )
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.pageId.localeCompare(b.pageId))
    send(res, 200, pager(all))
    return true
  }
  if (readonly && (method === 'PUT' || pageId === '_candidates')) {
    send(res, 403, null, 'Access denied')
    return true
  }
  const people = [
    { userId: 'u1', name: 'Test User' },
    { userId: 'member', name: 'Viewer member' },
  ]
  if (pageId === '_candidates' && method === 'POST') {
    const keyword = String(data.keyword || '').toLowerCase()
    send(res, 200, pager(people.filter((row) => row.name.toLowerCase().includes(keyword))))
    return true
  }
  const flatten = (items: PrototypePage[]): PrototypePage[] =>
    items.flatMap((item) => [item, ...flatten(item.children || [])])
  const page = flatten(pages(revision.id)).find((row) => !row.folder && row.pageId === pageId)
  if (!page?.path) {
    send(res, 404, null, 'Page unavailable')
    return true
  }
  const key = `${versionId}/${revision.id}/${pageId}`,
    current = rows.get(key)
  const unset: PageDelivery = {
    projectId: revision.projectId,
    versionId,
    revisionId: revision.id,
    pageId,
    pageName: page.name,
    pagePath: page.path,
    state: null,
    assignee: null,
    reason: '',
    configVersion: 0,
    updatedAt: null,
  }
  if (method === 'GET') {
    send(res, 200, current || unset)
    return true
  }
  if (method !== 'PUT') {
    send(res, 405, null, 'Method not allowed')
    return true
  }
  const person = people.find((person) => person.userId === data.assigneeId)
  if (data.assigneeId && !person) {
    send(res, 400, null, 'Assignee unavailable', 'PROTOTYPE_HUB_PAGE_DELIVERY_ASSIGNEE_INVALID')
    return true
  }
  if (
    !['DRAFT', 'READY', 'IN_PROGRESS', 'DONE'].includes(String(data.state)) ||
    String(data.reason || '').length > 2000 ||
    !/^[\x21-\x7e]{1,128}$/.test(String(data.clientRequestId))
  ) {
    send(res, 400, null, 'Invalid input')
    return true
  }
  const receiptKey = `${actor}/${key}/${String(data.clientRequestId)}`,
    payload = JSON.stringify(data),
    receipt = receipts.get(receiptKey)
  if (receipt) {
    send(
      res,
      receipt === payload ? 200 : 409,
      receipt === payload ? current : null,
      receipt === payload ? undefined : 'Request changed',
      receipt === payload ? undefined : 'PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT',
    )
    return true
  }
  if ((current?.configVersion || 0) !== data.expectedVersion) {
    send(res, 409, null, 'Record changed', 'PROTOTYPE_HUB_PAGE_DELIVERY_CONFLICT')
    return true
  }
  const row: PageDelivery = {
    ...unset,
    state: data.state as PageDeliveryState,
    assignee: person ? { ...person, available: true } : null,
    reason: String(data.reason || ''),
    configVersion: (current?.configVersion || 0) + 1,
    updatedAt: now,
  }
  rows.set(key, row)
  receipts.set(receiptKey, payload)
  send(res, 200, row)
  return true
}
