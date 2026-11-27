import { createHash } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { PrototypePage, Revision } from '../../src/modules/protohub-manager-ui/types'
import type {
  DemoScript,
  DemoScriptDraft,
} from '../../src/modules/protohub-manager-ui/types/demo-script'
import { validDemoScript } from '../../src/modules/protohub-manager-ui/utils/demo-script'

// UI transport fixture only; real authorization, SQL and receipt durability require the backend.
const records = new Map<string, DemoScript>()
const receipts = new Map<string, { fingerprint: string; id: string; deleted: boolean }>()
export function resetDemoScripts() {
  records.clear()
  receipts.clear()
}
type Send = (res: ServerResponse, status: number, result: unknown, message?: string) => void
function summary(row: DemoScript) {
  const {
    id,
    projectId,
    versionId,
    revisionId,
    title,
    shareEnabled,
    configVersion,
    createdAt,
    updatedAt,
  } = row
  return {
    id,
    projectId,
    versionId,
    revisionId,
    title,
    shareEnabled,
    configVersion,
    createdAt,
    updatedAt,
  }
}
function publicSummary(row: DemoScript) {
  return { id: row.id, revisionId: row.revisionId, title: row.title }
}
function publicDetail(row: DemoScript) {
  return {
    ...publicSummary(row),
    objective: row.objective,
    prerequisites: row.prerequisites,
    resetNote: row.resetNote,
    steps: row.steps,
  }
}
function pager(rows: DemoScript[], data: Record<string, unknown>, isPublic: boolean) {
  const pageIndex = data.pageIndex ?? 0,
    pageSize = data.pageSize ?? 20
  if (
    !Number.isInteger(pageIndex) ||
    !Number.isInteger(pageSize) ||
    Number(pageIndex) < 0 ||
    Number(pageIndex) > 10000 ||
    Number(pageSize) < 1 ||
    Number(pageSize) > 100
  )
    return null
  const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
  return {
    data: sorted
      .slice(Number(pageIndex) * Number(pageSize), (Number(pageIndex) + 1) * Number(pageSize))
      .map(isPublic ? publicSummary : summary),
    total: sorted.length,
    pageIndex,
    pageSize,
  }
}
export function publicDemoScriptResponse(
  suffix: string,
  method: string,
  data: Record<string, unknown>,
  revision: Revision,
  res: ServerResponse,
  send: Send,
) {
  if (!suffix.startsWith('/demo-scripts')) return false
  const rows = [...records.values()].filter(
    (row) => row.revisionId === revision.id && row.shareEnabled,
  )
  if (method === 'POST' && suffix === '/demo-scripts/_query') {
    const result = pager(rows, data, true)
    send(res, result ? 200 : 400, result)
  } else {
    const id = suffix.match(/^\/demo-scripts\/([^/]+)\/context$/)?.[1]
    const row = rows.find((value) => value.id === id)
    send(
      res,
      method === 'POST' && row ? 200 : 404,
      row ? publicDetail(row) : null,
      'Script unavailable',
    )
  }
  return true
}
export function demoScriptResponse(
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
  const match = path.match(
    /^\/prototype-hub\/versions\/([^/]+)\/revisions\/([^/]+)\/demo-scripts(.*)$/,
  )
  if (!match) return false
  const versionId = decodeURIComponent(match[1]!),
    revisionId = decodeURIComponent(match[2]!),
    suffix = match[3] || ''
  const revision = revisions.get(revisionId)
  if (!revision || revision.versionId !== versionId) {
    send(res, 404, null)
    return true
  }
  const rows = [...records.values()].filter(
    (row) => row.versionId === versionId && row.revisionId === revisionId,
  )
  if (method === 'POST' && suffix === '/_query') {
    const result = pager(rows, data, false)
    send(res, result ? 200 : 400, result)
    return true
  }
  const rowMatch = suffix.match(/^\/([^/]+)(\/_delete)?$/),
    id = rowMatch?.[1]
  const original = rows.find((row) => row.id === id)
  if (method === 'GET' && rowMatch && !rowMatch[2]) {
    send(res, original ? 200 : 404, original || null)
    return true
  }
  if (readonly) {
    send(res, 403, null)
    return true
  }
  const key = data.clientRequestId
  if (typeof key !== 'string' || !/^[\x20-\x7e]{1,128}$/.test(key)) {
    send(res, 400, null)
    return true
  }
  const receiptKey = `${actor}:${versionId}:${revisionId}:${key}`,
    fingerprint = JSON.stringify({ method, suffix, data })
  const receipt = receipts.get(receiptKey)
  if (receipt) {
    const current = records.get(receipt.id)
    const valid = receipt.fingerprint === fingerprint && (receipt.deleted || !!current)
    send(res, valid ? 200 : 409, valid ? receipt.deleted || current : null)
    return true
  }
  if (rowMatch && !original) {
    send(res, 409, null)
    return true
  }
  if (
    original &&
    (typeof data.expectedVersion !== 'number' ||
      !Number.isSafeInteger(data.expectedVersion) ||
      data.expectedVersion !== original.configVersion ||
      original.configVersion === Number.MAX_SAFE_INTEGER)
  ) {
    send(res, 409, null)
    return true
  }
  if (method === 'POST' && original && rowMatch?.[2]) {
    records.delete(original.id)
    receipts.set(receiptKey, { fingerprint, id: original.id, deleted: true })
    send(res, 200, true)
    return true
  }
  if (!((method === 'POST' && !suffix) || (method === 'PUT' && original && !rowMatch?.[2]))) {
    send(res, 404, null)
    return true
  }
  const allowed = [
    'title',
    'objective',
    'prerequisites',
    'resetNote',
    'steps',
    'shareEnabled',
    'clientRequestId',
    ...(original ? ['expectedVersion'] : []),
  ]
  const draft = {
    title: data.title,
    objective: data.objective,
    prerequisites: data.prerequisites ?? '',
    resetNote: data.resetNote ?? '',
    steps: data.steps,
    shareEnabled: data.shareEnabled ?? false,
  } as DemoScriptDraft
  const flatten = (items: PrototypePage[]): PrototypePage[] =>
    items.flatMap((page) => [page, ...flatten(page.children || [])])
  const pageIds = new Set(
    flatten(pages(revisionId))
      .filter((page) => !page.folder && page.path && page.pageId)
      .map((page) => page.pageId!),
  )
  if (
    Object.keys(data).some((field) => !allowed.includes(field)) ||
    !validDemoScript(draft, pageIds) ||
    draft.steps.some((step) =>
      Object.keys(step).some((field) => !['id', 'pageId', 'narration'].includes(field)),
    )
  ) {
    send(res, 400, null)
    return true
  }
  const recordId = original?.id || createHash('sha256').update(receiptKey).digest('hex')
  const result: DemoScript = {
    ...draft,
    id: recordId,
    projectId: revision.projectId,
    versionId,
    revisionId,
    configVersion: original ? original.configVersion + 1 : 0,
    createdAt: original?.createdAt ?? now,
    updatedAt: now,
  }
  records.set(result.id, structuredClone(result))
  receipts.set(receiptKey, { fingerprint, id: result.id, deleted: false })
  send(res, 200, result)
  return true
}
