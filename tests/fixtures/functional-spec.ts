import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { PrototypePage, Revision } from '../../src/modules/protohub-manager-ui/types'
import type { FunctionalSpec } from '../../src/modules/protohub-manager-ui/types/functional-spec'
import { isReviewAnchor } from '../../src/modules/protohub-manager-ui/utils/review-anchor'

// Wire/UI fixture only. Authorization, persistence and database evidence come from the real server.
const records = new Map<string, FunctionalSpec[]>()
const receipts = new Map<string, { fingerprint: string; result: unknown }>()
export function resetFunctionalSpecs() {
  records.clear()
  receipts.clear()
}
type Send = (
  res: ServerResponse,
  status: number,
  result: unknown,
  message?: string,
  code?: string,
) => void
export function functionalSpecResponse(
  path: string,
  method: string,
  data: Record<string, unknown>,
  readonly: boolean,
  actor: string,
  revisions: Map<string, Revision>,
  pages: (revisionId: string) => PrototypePage[],
  res: ServerResponse,
  send: Send,
  now: number,
) {
  const match = path.match(/^\/prototype-hub\/versions\/([^/]+)\/element-descriptions(.*)$/)
  if (!match) return false
  const versionId = decodeURIComponent(match[1]!),
    suffix = match[2] || ''
  const revision = revisions.get(String(data.revisionId || ''))
  const flatten = (items: PrototypePage[]): PrototypePage[] =>
    items.flatMap((page) => [page, ...flatten(page.children || [])])
  const page =
    revision &&
    flatten(pages(revision.id)).find((item) => item.pageId === data.pageId && !item.folder)
  if (!revision || revision.versionId !== versionId || !page?.path) {
    send(res, 404, null, 'Page unavailable')
    return true
  }
  const key = `${versionId}/${revision.id}/${page.pageId}`,
    rows = records.get(key) || []
  if (method === 'POST' && suffix === '/_query') {
    const pageIndex = Number(data.pageIndex || 0),
      pageSize = Math.min(100, Number(data.pageSize || 20))
    const all = rows
      .filter((row) => !data.keyword || row.title.includes(String(data.keyword)))
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    send(res, 200, {
      data: all.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      total: all.length,
      pageIndex,
      pageSize,
    })
    return true
  }
  const rowMatch = suffix.match(/^\/([^/]+)(\/_delete)?$/),
    id = rowMatch && decodeURIComponent(rowMatch[1]!)
  const original = rows.find((row) => row.id === id)
  if (method === 'GET' && rowMatch && !rowMatch[2]) {
    send(
      res,
      original ? 200 : 404,
      original || null,
      'Unavailable',
      'PROTOTYPE_HUB_ELEMENT_DESCRIPTION_NOT_FOUND',
    )
    return true
  }
  if (readonly) {
    send(res, 403, null, 'Read-only project')
    return true
  }
  if (!data.clientRequestId) {
    send(res, 400, null, 'Missing request ID')
    return true
  }
  const receiptKey = `${actor}:${key}:${data.clientRequestId}`,
    fingerprint = JSON.stringify({ method, suffix, data }),
    receipt = receipts.get(receiptKey)
  if (receipt) {
    send(
      res,
      receipt.fingerprint === fingerprint ? 200 : 409,
      receipt.fingerprint === fingerprint ? receipt.result : null,
      'Idempotency conflict',
      'PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT',
    )
    return true
  }
  if (rowMatch && !original) {
    send(res, 404, null, 'Unavailable', 'PROTOTYPE_HUB_ELEMENT_DESCRIPTION_NOT_FOUND')
    return true
  }
  if (original && original.configVersion !== data.expectedVersion) {
    send(res, 409, null, 'Changed elsewhere', 'PROTOTYPE_HUB_ELEMENT_DESCRIPTION_CONFLICT')
    return true
  }
  const respond = (result: unknown) => {
    receipts.set(receiptKey, { fingerprint, result })
    send(res, 200, result)
    return true
  }
  if (method === 'POST' && original && rowMatch?.[2]) {
    records.set(
      key,
      rows.filter((row) => row !== original),
    )
    return respond(true)
  }
  if ((method === 'POST' && !suffix) || (method === 'PUT' && original && !rowMatch?.[2])) {
    const fields = [
      'title',
      'purpose',
      'inputRules',
      'permissionRules',
      'navigationRules',
      'notes',
    ] as const
    if (
      !String(data.title || '').trim() ||
      fields.some(
        (field) =>
          typeof data[field] !== 'string' ||
          String(data[field]).length > (field === 'title' ? 120 : field === 'notes' ? 4000 : 2000),
      ) ||
      (data.anchor != null && !isReviewAnchor(data.anchor))
    ) {
      send(res, 400, null, 'Invalid description')
      return true
    }
    const row: FunctionalSpec = {
      id: original?.id || randomUUID(),
      projectId: revision.projectId,
      versionId,
      revisionId: revision.id,
      pageId: page.pageId!,
      title: String(data.title),
      purpose: String(data.purpose),
      inputRules: String(data.inputRules),
      permissionRules: String(data.permissionRules),
      navigationRules: String(data.navigationRules),
      notes: String(data.notes),
      anchor: data.anchor as FunctionalSpec['anchor'],
      configVersion: original ? original.configVersion + 1 : 0,
      createdAt: original?.createdAt || now,
      updatedAt: now,
    }
    records.set(
      key,
      original ? rows.map((item) => (item === original ? row : item)) : [...rows, row],
    )
    return respond(row)
  }
  send(res, 404, null, 'Not found')
  return true
}
