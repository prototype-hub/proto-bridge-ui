import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { PrototypePage, Revision } from '../../src/modules/protohub-manager-ui/types'
import {
  viewportCategories,
  viewportResults,
  type ViewportCheck,
  type ViewportDraft,
} from '../../src/modules/protohub-manager-ui/types/viewport-check'

// Wire/UI fixture only. Persistence, authorization and database paging need real backend evidence.
const checks = new Map<string, ViewportCheck[]>()
const receipts = new Map<string, { fingerprint: string; result: unknown }>()
export function resetViewportChecks() {
  checks.clear()
  receipts.clear()
}
type Send = (
  res: ServerResponse,
  status: number,
  result: unknown,
  message?: string,
  code?: string,
) => void
export function viewportCheckResponse(
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
  const match = path.match(
    /^\/prototype-hub\/versions\/([^/]+)\/revisions\/([^/]+)\/pages\/([^/]+)\/viewport-checks(.*)$/,
  )
  if (!match) return false
  const [, versionId, revisionId, pageId, suffix] = match
  const revision = revisions.get(decodeURIComponent(revisionId!))
  const flatten = (items: PrototypePage[]): PrototypePage[] =>
    items.flatMap((page) => [page, ...flatten(page.children || [])])
  const page =
    revision &&
    flatten(pages(revision.id)).find(
      (item) => item.pageId === decodeURIComponent(pageId!) && !item.folder,
    )
  if (!revision || revision.versionId !== versionId || !page?.path) {
    send(res, 404, null, 'Page unavailable')
    return true
  }
  const key = `${versionId}/${revisionId}/${pageId}`
  const rows = checks.get(key) || []
  if (method === 'POST' && suffix === '/_query') {
    const pageIndex = Number(data.pageIndex || 0),
      pageSize = Number(data.pageSize || 20)
    const all = rows
      .filter(
        (row) =>
          (!data.category || row.category.value === data.category) &&
          (!data.result || row.result.value === data.result),
      )
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    send(res, 200, {
      data: all.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      total: all.length,
      pageIndex,
      pageSize,
    })
    return true
  }
  if (readonly) {
    send(res, 403, null, 'Read-only project')
    return true
  }
  const receiptKey = `${actor}:${key}:${suffix}:${data.clientRequestId}`,
    fingerprint = JSON.stringify({ method, data }),
    receipt = receipts.get(receiptKey)
  if (!data.clientRequestId) {
    send(res, 400, null, 'Missing request ID')
    return true
  }
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
  const respond = (result: unknown) => {
    receipts.set(receiptKey, { fingerprint, result })
    send(res, 200, result)
    return true
  }
  const rowMatch = suffix?.match(/^\/([^/]+)(\/_delete)?$/),
    original = rowMatch && rows.find((row) => row.id === decodeURIComponent(rowMatch[1]!))
  if (rowMatch && !original) {
    send(res, 404, null, 'Check unavailable', 'PROTOTYPE_HUB_VIEWPORT_CHECK_NOT_FOUND')
    return true
  }
  if (original && original.configVersion !== data.expectedVersion) {
    send(res, 409, null, 'Check changed', 'PROTOTYPE_HUB_VIEWPORT_CHECK_CONFLICT')
    return true
  }
  if (method === 'POST' && original && rowMatch?.[2]) {
    checks.set(
      key,
      rows.filter((row) => row !== original),
    )
    return respond(true)
  }
  if ((method === 'POST' && !suffix) || (method === 'PUT' && original && !rowMatch?.[2])) {
    const input = data as unknown as ViewportDraft
    if (
      !String(input.title || '').trim() ||
      input.title.length > 120 ||
      !String(input.expected || '').trim() ||
      input.expected.length > 2000 ||
      !viewportCategories.includes(input.category) ||
      !viewportResults.includes(input.result) ||
      (input.result !== 'untested' && !String(input.observed || '').trim()) ||
      ['steps', 'observed', 'evidence'].some((key) => String(data[key] || '').length > 2000) ||
      ['viewportWidth', 'viewportHeight', 'viewportScale'].some(
        (key) =>
          !Number.isInteger(data[key]) ||
          Number(data[key]) < (key === 'viewportScale' ? 25 : 240) ||
          Number(data[key]) > (key === 'viewportScale' ? 200 : 3840),
      )
    ) {
      send(res, 400, null, 'Invalid check')
      return true
    }
    const row: ViewportCheck = {
      id: original?.id || randomUUID(),
      projectId: revision.projectId,
      versionId: revision.versionId,
      revisionId: revision.id,
      pageId: page.pageId!,
      title: input.title,
      category: { value: input.category, text: input.category },
      steps: input.steps || '',
      expected: input.expected,
      observed: input.observed || '',
      evidence: input.evidence || '',
      result: { value: input.result, text: input.result },
      viewportWidth: input.viewportWidth,
      viewportHeight: input.viewportHeight,
      viewportScale: input.viewportScale,
      configVersion: original ? original.configVersion + 1 : 0,
      createdAt: original?.createdAt || now,
      updatedAt: now,
    }
    checks.set(
      key,
      original ? rows.map((item) => (item === original ? row : item)) : [...rows, row],
    )
    return respond(row)
  }
  send(res, 404, null, 'Not found')
  return true
}
