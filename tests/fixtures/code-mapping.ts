import { createHash } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { PrototypePage, Revision } from '../../src/modules/protohub-manager-ui/types'
import type {
  CodeMappingCard,
  CodeMappingDraft,
  CodeMappingDescriptionRef,
} from '../../src/modules/protohub-manager-ui/types/code-mapping'
import {
  codeMappingDraft,
  codeMappingText,
  codeMappingIssues,
  codeMappingFormat,
} from '../../src/modules/protohub-manager-ui/utils/code-mapping'
import { traceDescriptions } from './functional-spec'

// Wire/UI fixture only; transactions, authorization and persistence are tested on the actual backend.
const cards = new Map<string, CodeMappingCard>()
const receipts = new Map<string, { fingerprint: string; ids: string[] }>()
export function resetCodeMappings() {
  cards.clear()
  receipts.clear()
}
type Send = (
  res: ServerResponse,
  status: number,
  result: unknown,
  message?: string,
  code?: string,
) => void
export function codeMappingResponse(
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
    /^\/prototype-hub\/versions\/([^/]+)\/revisions\/([^/]+)\/pages\/([^/]+)\/code-mappings(.*)$/,
  )
  if (!match) return false
  const [, versionId, revisionId, pageId, suffix] = match.map((value) => decodeURIComponent(value))
  const revision = revisions.get(revisionId!)
  const flatten = (items: PrototypePage[]): PrototypePage[] =>
    items.flatMap((page) => [page, ...flatten(page.children || [])])
  const page =
    revision &&
    flatten(pages(revision.id)).find((item) => item.pageId === pageId && !item.folder && item.path)
  const respond = (status: number, value: unknown, code?: string) => {
    send(res, status, value, status >= 400 ? 'Code mapping request rejected' : undefined, code)
    return true
  }
  if (!revision || revision.versionId !== versionId || !page) return respond(404, null)
  const belongs = (card: CodeMappingCard) =>
    card.versionId === versionId && card.revisionId === revisionId && card.pageId === pageId
  const source = (ref: CodeMappingDescriptionRef | null) =>
    ref
      ? traceDescriptions().find(
          (item) =>
            item.projectId === revision.projectId &&
            item.versionId === versionId &&
            item.revisionId === revisionId &&
            item.pageId === pageId &&
            item.id === ref.id,
        )
      : undefined
  const resolve = (card: CodeMappingCard): CodeMappingCard => {
    const ref = card.description,
      detail = source(ref)
    return {
      ...card,
      description: ref
        ? {
            id: ref.id,
            expectedVersion: ref.expectedVersion,
            status: !detail
              ? 'missing'
              : detail.configVersion === ref.expectedVersion
                ? 'current'
                : 'changed',
            currentVersion: detail?.configVersion ?? null,
            title: detail?.title ?? null,
          }
        : null,
    }
  }
  const current = (id: string) => {
    const card = cards.get(id)
    return card && belongs(card) ? resolve(card) : undefined
  }
  if (method === 'POST' && suffix === '/_query') {
    const all = [...cards.values()]
      .filter(belongs)
      .filter((card) => !data.keyword || card.alias.includes(String(data.keyword)))
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    const index = Number(data.pageIndex || 0),
      size = Number(data.pageSize || 20)
    return respond(200, {
      data: all.slice(index * size, (index + 1) * size).map(resolve),
      total: all.length,
      pageIndex: index,
      pageSize: size,
    })
  }
  const rowMatch = suffix!.match(/^\/([^/]+)(\/_delete)?$/),
    id = rowMatch?.[1],
    original = id ? current(id) : undefined
  if (method === 'GET' && rowMatch) return respond(original ? 200 : 404, original || null)
  if (method === 'POST' && suffix === '/_export') {
    const ids = data.ids as string[]
    if (!Array.isArray(ids) || !ids.length || ids.length > 50 || new Set(ids).size !== ids.length)
      return respond(400, null)
    const selected = ids.map(current)
    if (selected.some((card) => !card)) return respond(404, null)
    const bytes = Buffer.from(
      JSON.stringify({
        format: codeMappingFormat,
        schemaVersion: 1,
        cards: selected.map((card) => codeMappingText(card!)),
      }),
    )
    if (bytes.length > 1048576) return respond(413, null)
    res.writeHead(200, {
      'Content-Type': 'application/json;charset=UTF-8',
      'Content-Disposition': 'attachment; filename="code-mapping-cards.json"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(bytes)
    return true
  }
  if (readonly) return respond(403, null)
  if (!data.clientRequestId) return respond(400, null)
  const key = JSON.stringify([
    actor,
    revision.projectId,
    versionId,
    revisionId,
    pageId,
    method,
    suffix,
    data.clientRequestId,
  ])
  const fingerprint = JSON.stringify(data),
    receipt = receipts.get(key)
  const importResult = (ids: string[]) => ({
    items: ids.map((itemId) => {
      const card = current(itemId)
      return { id: itemId, status: card ? 'current' : 'missing', card: card || null }
    }),
  })
  if (receipt) {
    if (receipt.fingerprint !== fingerprint)
      return respond(409, null, 'PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT')
    if (suffix === '/_import') return respond(200, importResult(receipt.ids))
    if (suffix?.endsWith('/_delete')) return respond(200, true)
    const card = current(receipt.ids[0]!)
    return respond(
      card ? 200 : 409,
      card || null,
      card ? undefined : 'PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT',
    )
  }
  if (method === 'POST' && rowMatch?.[2]) {
    if (!original) return respond(404, null)
    if (original.configVersion !== data.expectedVersion)
      return respond(409, null, 'PROTOTYPE_HUB_CODE_MAPPING_CONFLICT')
    cards.delete(original.id)
    receipts.set(key, { fingerprint, ids: [original.id] })
    return respond(200, true)
  }
  const importing = method === 'POST' && suffix === '/_import'
  if (
    !importing &&
    !(method === 'POST' && suffix === '') &&
    !(method === 'PUT' && rowMatch && !rowMatch[2])
  )
    return respond(404, null)
  if (method === 'PUT' && (!original || original.configVersion !== data.expectedVersion))
    return respond(original ? 409 : 404, null, 'PROTOTYPE_HUB_CODE_MAPPING_CONFLICT')
  const drafts = (importing ? data.cards : [data]) as CodeMappingDraft[]
  if (
    !Array.isArray(drafts) ||
    !drafts.length ||
    drafts.length > 50 ||
    (importing && (data.format !== codeMappingFormat || data.schemaVersion !== 1)) ||
    drafts.some((card) => codeMappingIssues(card).length)
  )
    return respond(400, null)
  for (const draft of drafts) {
    const ref = draft.description
    if (
      ref &&
      JSON.stringify(original && codeMappingDraft(original).description) !== JSON.stringify(ref)
    ) {
      const detail = source(ref)
      if (!detail) return respond(404, null, 'PROTOTYPE_HUB_CODE_MAPPING_DESCRIPTION_NOT_FOUND')
      if (detail.configVersion !== ref.expectedVersion)
        return respond(409, null, 'PROTOTYPE_HUB_CODE_MAPPING_DESCRIPTION_CHANGED')
    }
  }
  const ids = drafts.map(
    (_, index) => original?.id || createHash('sha256').update(`${key}:${index}`).digest('hex'),
  )
  drafts.forEach((draft, index) =>
    cards.set(ids[index]!, {
      ...codeMappingText(draft),
      id: ids[index]!,
      projectId: revision.projectId,
      versionId: versionId!,
      revisionId: revisionId!,
      pageId: pageId!,
      description: draft.description
        ? {
            ...draft.description,
            status: 'current',
            currentVersion: draft.description.expectedVersion,
            title: source(draft.description)?.title || null,
          }
        : null,
      configVersion: original ? original.configVersion + 1 : 0,
      createdAt: original?.createdAt || now,
      updatedAt: now,
    }),
  )
  receipts.set(key, { fingerprint, ids })
  return respond(200, importing ? importResult(ids) : current(ids[0]!))
}
