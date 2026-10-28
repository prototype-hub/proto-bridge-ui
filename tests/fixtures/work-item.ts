import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { Revision, WorkItem, PrototypePage } from '../../src/modules/protohub-manager-ui/types'

// UI fixtures exercise wire and interaction behavior; database/authorization guarantees use live tests.
const rows = new Map<string, WorkItem>()
const receipts = new Map<string, { payload: string; id: string; deleted: boolean }>()
export function resetWorkItems() {
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
export function workItemResponse(
  path: string,
  method: string,
  data: Record<string, unknown>,
  member: boolean,
  revisions: Map<string, Revision>,
  pages: (id: string) => PrototypePage[],
  res: ServerResponse,
  send: Send,
  now: number,
) {
  const match = path.match(
    /^\/prototype-hub\/versions\/([^/]+)\/work-items(?:\/([^/]+))?(\/_delete)?$/,
  )
  if (!match) return false
  const versionId = decodeURIComponent(match[1]!),
    id = match[2] && decodeURIComponent(match[2]),
    revision = revisions.get(String(data.revisionId))
  const flat = (items: PrototypePage[]): PrototypePage[] =>
    items.flatMap((item) => [item, ...flat(item.children || [])])
  if (
    !revision ||
    revision.versionId !== versionId ||
    !flat(pages(revision.id)).some((page) => !page.folder && page.pageId === data.pageId)
  ) {
    send(res, 404, null, 'Work items unavailable')
    return true
  }
  if (id === '_query' && method === 'POST') {
    const pageIndex = Number(data.pageIndex || 0),
      pageSize = Number(data.pageSize || 20)
    const all = [...rows.values()]
      .filter(
        (row) =>
          row.versionId === versionId &&
          row.revisionId === revision.id &&
          row.pageId === data.pageId,
      )
      .sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id))
    send(res, 200, {
      data: all.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      total: all.length,
      pageIndex,
      pageSize,
    })
    return true
  }
  if (member) {
    send(res, 403, null, 'Access denied')
    return true
  }
  const deleting = method === 'POST' && !!match[3]
  if ((!id && method !== 'POST') || (id && !deleting && method !== 'PUT')) {
    send(res, 405, null, 'Method not allowed')
    return true
  }
  let validUrl = false
  try {
    const url = new URL(String(data.url))
    validUrl =
      ['http:', 'https:'].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password &&
      !Array.from(String(data.url)).some(
        (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
      )
  } catch {
    /* Invalid URL stays false. */
  }
  if (
    !/^[\x21-\x7e]{1,128}$/.test(String(data.clientRequestId)) ||
    (!deleting &&
      (!validUrl || String(data.url).length > 2048 || String(data.note || '').length > 2000))
  ) {
    send(res, 400, null, 'Invalid work item')
    return true
  }
  const key = `${path}:${method}:${String(data.clientRequestId)}`,
    payload = JSON.stringify(data),
    receipt = receipts.get(key)
  if (receipt) {
    const current = rows.get(receipt.id)
    if (receipt.payload !== payload || (!receipt.deleted && !current))
      send(res, 409, null, 'Operation changed', 'PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT')
    else send(res, 200, receipt.deleted ? true : current)
    return true
  }
  const current = id ? rows.get(id) : undefined
  if (
    id &&
    (!current ||
      current.revisionId !== revision.id ||
      current.pageId !== data.pageId ||
      current.configVersion !== data.expectedVersion)
  ) {
    send(res, 409, null, 'Work item changed', 'PROTOTYPE_HUB_WORK_ITEM_CONFLICT')
    return true
  }
  if (deleting) {
    rows.delete(id!)
    receipts.set(key, { payload, id: id!, deleted: true })
    send(res, 200, true)
    return true
  }
  const row: WorkItem = {
    id: id || randomUUID(),
    projectId: revision.projectId,
    versionId,
    revisionId: revision.id,
    pageId: String(data.pageId),
    url: String(data.url),
    note: String(data.note || ''),
    configVersion: current ? current.configVersion + 1 : 0,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  }
  rows.set(row.id, row)
  receipts.set(key, { payload, id: row.id, deleted: false })
  send(res, 200, row)
  return true
}
