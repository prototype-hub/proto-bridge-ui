import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { PrototypePage, Revision } from '../../src/modules/protohub-manager-ui/types'
import type {
  CopyInventoryEntry,
  CopyInventorySnapshot,
} from '../../src/modules/protohub-manager-ui/types/copy-inventory'

// Wire/UI fixture only. Extraction, database paging and authorization use real backend evidence.
const inventories = new Map<
  string,
  { snapshot: CopyInventorySnapshot; entries: CopyInventoryEntry[] }
>()
const receipts = new Map<string, { fingerprint: string; result: unknown }>()
export function resetCopyInventories() {
  inventories.clear()
  receipts.clear()
}
type Send = (
  res: ServerResponse,
  status: number,
  result: unknown,
  message?: string,
  code?: string,
) => void
export function copyInventoryResponse(
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
    /^\/prototype-hub\/versions\/([^/]+)\/revisions\/([^/]+)\/pages\/([^/]+)\/copy-inventory(.*)$/,
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
  const key = `${versionId}/${revisionId}/${pageId}`,
    inventory = inventories.get(key)
  const notExtracted: CopyInventorySnapshot = {
    projectId: revision.projectId,
    versionId: revision.versionId,
    revisionId: revision.id,
    pageId: page.pageId!,
    pagePath: page.path,
    manifestSha256: revision.manifestSha256,
    fileSha256: 'a'.repeat(64),
    snapshotId: null,
    extractorVersion: null,
    extractionState: 'NOT_EXTRACTED',
    limitReason: null,
    staticComplete: false,
    dynamicTextGap: true,
    staticCount: 0,
    manualCount: 0,
    configVersion: null,
    extractedAt: null,
  }
  const snapshot = () =>
    inventory
      ? {
          ...inventory.snapshot,
          manualCount: inventory.entries.filter((entry) => entry.kind === 'MANUAL').length,
        }
      : notExtracted
  if (method === 'GET' && !suffix) {
    send(res, 200, snapshot())
    return true
  }
  if (method === 'POST' && suffix === '/entries/_query') {
    const keyword = String(data.keyword || '').toLowerCase(),
      pageIndex = Number(data.pageIndex || 0),
      pageSize = Number(data.pageSize || 20)
    const all = (inventory?.entries || []).filter(
      (entry) =>
        (!data.kind || entry.kind === data.kind) &&
        (data.hasRequirement === undefined || !!entry.requirementUrl === data.hasRequirement) &&
        (!keyword ||
          [entry.text, entry.businessTerm, entry.note].some((value) =>
            value.toLowerCase().includes(keyword),
          )),
    )
    send(res, 200, {
      snapshot: snapshot(),
      data: all.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      total: all.length,
      pageIndex,
      pageSize,
    })
    return true
  }
  if (method === 'POST' && suffix === '/_export') {
    if (!inventory || data.expectedVersion !== inventory.snapshot.configVersion) {
      send(res, 409, null, 'Inventory changed')
      return true
    }
    const full = { formatVersion: 1, snapshot: snapshot(), entries: inventory.entries }
    const isCsv = data.format === 'csv'
    const csvCell = (value: unknown) => {
      let text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
      if (/^[\s\p{Cc}]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`
      return `"${text.replaceAll('"', '""')}"`
    }
    const csvKeys = [
      'recordType',
      'projectId',
      'versionId',
      'revisionId',
      'pageId',
      'snapshotId',
      'inventoryVersion',
      'pagePath',
      'manifestSha256',
      'fileSha256',
      'extractorVersion',
      'extractionState',
      'limitReason',
      'staticComplete',
      'dynamicTextGap',
      'id',
      'kind',
      'text',
      'businessTerm',
      'note',
      'requirementUrl',
      'occurrenceCount',
      'occurrences',
      'configVersion',
      'createdAt',
      'updatedAt',
    ]
    const context = { ...snapshot(), inventoryVersion: inventory.snapshot.configVersion }
    const records: Record<string, unknown>[] = [
      { ...context, recordType: 'SNAPSHOT' },
      ...inventory.entries.map((entry) => ({ ...context, ...entry, recordType: 'ENTRY' })),
    ]
    const output = isCsv
      ? '\uFEFF' +
        [
          csvKeys.map(csvCell).join(','),
          ...records.map((record) =>
            csvKeys.map((column) => csvCell(record[column] ?? '')).join(','),
          ),
        ].join('\r\n') +
        '\r\n'
      : JSON.stringify(full)
    res.statusCode = 200
    res.setHeader('Content-Type', isCsv ? 'text/csv;charset=UTF-8' : 'application/json')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="copy-${revisionId}-${pageId}.${isCsv ? 'csv' : 'json'}"`,
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.end(output)
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
    )
    return true
  }
  const respond = (result: unknown) => {
    receipts.set(receiptKey, { fingerprint, result })
    send(res, 200, result)
    return true
  }
  if (method === 'POST' && suffix === '/_extract') {
    if (inventory) return respond(snapshot())
    const isEmpty = page.path === 'child.html'
    const entries: CopyInventoryEntry[] = isEmpty
      ? []
      : [
          {
            id: `static-${pageId}`,
            kind: 'STATIC',
            text: 'Contract element',
            businessTerm: '',
            note: '',
            requirementUrl: '',
            occurrenceCount: 1,
            occurrences: [{ ordinal: 1, sourceKind: 'TEXT' }],
            configVersion: 0,
            createdAt: now,
            updatedAt: now,
          },
        ]
    const value = {
      ...notExtracted,
      snapshotId: `snapshot-${revisionId}-${pageId}`,
      extractorVersion: 1,
      extractionState: isEmpty ? ('EMPTY' as const) : ('READY' as const),
      staticComplete: true,
      staticCount: entries.length,
      configVersion: 0,
      extractedAt: now,
    }
    inventories.set(key, { snapshot: value, entries })
    return respond(value)
  }
  if (!inventory) {
    send(res, 409, null, 'Not extracted')
    return true
  }
  const entryMatch = suffix?.match(/^\/entries\/([^/]+)(\/_delete)?$/)
  const original =
    entryMatch && inventory.entries.find((entry) => entry.id === decodeURIComponent(entryMatch[1]!))
  if (entryMatch && (!original || original.configVersion !== data.expectedVersion)) {
    send(res, 409, null, 'Copy conflict')
    return true
  }
  if (entryMatch?.[2] && method === 'POST') {
    if (original!.kind !== 'MANUAL') {
      send(res, 400, null, 'Static source is immutable')
      return true
    }
    inventory.entries = inventory.entries.filter((entry) => entry.id !== original!.id)
    inventory.snapshot.configVersion!++
    return respond({ inventoryVersion: inventory.snapshot.configVersion, deleted: true })
  }
  if ((suffix === '/entries' && method === 'POST') || (entryMatch && method === 'PUT')) {
    if (
      (original?.kind === 'STATIC' && data.text !== undefined) ||
      (original?.kind !== 'STATIC' &&
        (!String(data.text || '').trim() || String(data.text).length > 2000))
    ) {
      send(res, 400, null, 'Invalid copy text')
      return true
    }
    const entry: CopyInventoryEntry = {
      id: original?.id || randomUUID(),
      kind: original?.kind || 'MANUAL',
      text: original?.kind === 'STATIC' ? original.text : String(data.text),
      businessTerm: String(data.businessTerm || ''),
      note: String(data.note || ''),
      requirementUrl: String(data.requirementUrl || ''),
      occurrenceCount: original?.occurrenceCount || 0,
      occurrences: original?.occurrences || [],
      configVersion: original ? original.configVersion + 1 : 0,
      createdAt: original?.createdAt || now,
      updatedAt: now,
    }
    if (original)
      inventory.entries = inventory.entries.map((item) => (item.id === original.id ? entry : item))
    else inventory.entries.push(entry)
    inventory.snapshot.configVersion!++
    return respond({ inventoryVersion: inventory.snapshot.configVersion, entry })
  }
  send(res, 405, null, 'Unsupported method')
  return true
}
