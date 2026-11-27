import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { PrototypePage, Revision } from '../../src/modules/protohub-manager-ui/types'
import type {
  PageRelation,
  TraceContext,
  TraceContextDraft,
  TraceDecision,
  TraceSourceKind,
  TraceSourceDetail,
} from '../../src/modules/protohub-manager-ui/types/page-trace'
import { traceWorkItems } from './work-item'
import { traceDescriptions } from './functional-spec'
import { traceChecks } from './viewport-check'
import { searchableMaterials } from './revision-material'
// Wire/UI fixture. Authorization, CAS and persistence guarantees require the real server.
const relations = new Map<string, PageRelation>(),
  contexts = new Map<string, TraceContext>(),
  decisions = new Map<string, TraceDecision>()
const receipts = new Map<string, { fingerprint: string; kind: string; id: string }>()
export function resetPageTrace() {
  relations.clear()
  contexts.clear()
  decisions.clear()
  receipts.clear()
}
type Send = (
  res: ServerResponse,
  status: number,
  result: unknown,
  message?: string,
  code?: string,
) => void
export function pageTraceResponse(
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
    /^\/prototype-hub\/versions\/([^/]+)\/revisions\/([^/]+)\/page-traceability(.*)$/,
  )
  if (!match) return false
  const [, versionId, revisionId, suffix] = match,
    revision = revisions.get(decodeURIComponent(revisionId!))
  const respond = (status: number, result: unknown, code?: string) => {
    send(res, status, result, status >= 400 ? 'Trace request rejected' : undefined, code)
    return true
  }
  if (!revision || revision.versionId !== decodeURIComponent(versionId!)) return respond(404, null)
  const flat = (rows: PrototypePage[]): PrototypePage[] =>
    rows.flatMap((row) => [row, ...flat(row.children || [])])
  const pageIds = new Set(
    flat(pages(revision.id))
      .filter((row) => !row.folder && row.path)
      .map((row) => row.pageId),
  )
  const pageMatch = suffix!.match(/^\/pages\/([^/]+)\/(context|sources|decisions)(.*)$/)
  const pageId = pageMatch ? decodeURIComponent(pageMatch[1]!) : ''
  if (pageMatch && !pageIds.has(pageId)) return respond(404, null)
  const contextKey = `${revision.id}/${pageId}`
  function sources(kind: TraceSourceKind): TraceSourceDetail[] {
    const scope = (row: { versionId: string; revisionId: string; pageId?: string }) =>
      row.versionId === revision!.versionId &&
      row.revisionId === revision!.id &&
      (kind === 'material' || row.pageId === pageId)
    if (kind === 'work-item')
      return traceWorkItems()
        .filter(scope)
        .map((row) => ({
          kind,
          id: row.id,
          title: row.note || row.url,
          configVersion: row.configVersion,
          fields: { url: row.url, note: row.note },
        }))
    if (kind === 'material')
      return searchableMaterials()
        .filter(scope)
        .map((row) => ({
          kind,
          id: row.id,
          title: row.sourceName || row.fileName || row.materialType,
          configVersion: row.configVersion,
          fields: {
            type: row.materialType,
            description: row.sourceNotes || '',
            url: row.sourceUrl || '',
          },
        }))
    if (kind === 'description')
      return traceDescriptions()
        .filter(scope)
        .map((row) => ({
          kind,
          id: row.id,
          title: row.title,
          configVersion: row.configVersion,
          fields: {
            purpose: row.purpose,
            inputRules: row.inputRules,
            permissionRules: row.permissionRules,
            navigationRules: row.navigationRules,
            notes: row.notes,
          },
        }))
    if (kind === 'check')
      return traceChecks()
        .filter(scope)
        .map((row) => ({
          kind,
          id: row.id,
          title: row.title,
          configVersion: row.configVersion,
          fields: {
            category: row.category.text,
            expected: row.expected,
            observed: row.observed,
            evidence: row.evidence,
            result: row.result.text,
            steps: row.steps,
          },
        }))
    return []
  }
  const context = (): TraceContext => {
    const row = contexts.get(contextKey) || {
      id: null,
      projectId: revision!.projectId,
      versionId: revision!.versionId,
      revisionId: revision!.id,
      pageId,
      entry: false,
      references: [],
      configVersion: -1,
      createdAt: null,
      updatedAt: null,
    }
    return {
      ...row,
      references: row.references.map((ref) => {
        const source = sources(ref.kind).find((row) => row.id === ref.id)
        return {
          ...ref,
          status: !source
            ? 'missing'
            : source.configVersion === ref.expectedVersion
              ? 'current'
              : 'changed',
          currentVersion: source?.configVersion ?? null,
          title: source?.title ?? null,
        }
      }),
    }
  }
  const paged = (rows: unknown[]) => {
    const pageIndex = Number(data.pageIndex || 0),
      pageSize = Number(data.pageSize || 20)
    return respond(200, {
      data: rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      total: rows.length,
      pageIndex,
      pageSize,
    })
  }
  const list = <T extends { createdAt: number; id: string }>(rows: T[]) =>
    rows.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
  const revisionRelations = () =>
    [...relations.values()].filter((row) => row.revisionId === revision.id)
  if (method === 'POST' && suffix === '/relations/_query')
    return paged(
      list(
        revisionRelations().filter(
          (row) =>
            (!data.pageId ||
              (data.direction === 'incoming'
                ? row.toPageId === data.pageId
                : data.direction === 'outgoing'
                  ? row.fromPageId === data.pageId
                  : row.fromPageId === data.pageId || row.toPageId === data.pageId)) &&
            (!data.keyword || row.label.includes(String(data.keyword))),
        ),
      ),
    )
  if (method === 'POST' && suffix === '/entries/_query')
    return paged(
      [...contexts.values()]
        .filter((row) => row.revisionId === revision.id && row.entry)
        .map(({ pageId, configVersion, updatedAt }) => ({ pageId, configVersion, updatedAt })),
    )
  if (pageMatch && pageMatch[2] === 'context' && method === 'GET') return respond(200, context())
  if (pageMatch && pageMatch[2] === 'sources') {
    if (method === 'POST' && pageMatch[3] === '/_query')
      return paged(
        sources(data.kind as TraceSourceKind).map(({ kind, id, title, configVersion }) => ({
          kind,
          id,
          title,
          configVersion,
        })),
      )
    const detailMatch = pageMatch[3]!.match(/^\/([^/]+)\/([^/]+)$/)
    const detail =
      detailMatch &&
      sources(decodeURIComponent(detailMatch[1]!) as TraceSourceKind).find(
        (row) => row.id === decodeURIComponent(detailMatch[2]!),
      )
    return respond(detail ? 200 : 404, detail || null)
  }
  const relationMatch = suffix!.match(/^\/relations\/([^/]+)(\/_delete)?$/)
  const decisionMatch =
    pageMatch?.[2] === 'decisions' ? pageMatch[3]!.match(/^\/([^/]+)(\/_delete)?$/) : null
  const original = relationMatch
    ? relations.get(decodeURIComponent(relationMatch[1]!))
    : decisionMatch
      ? decisions.get(decodeURIComponent(decisionMatch[1]!))
      : undefined
  if (pageMatch?.[2] === 'decisions' && method === 'POST' && pageMatch[3] === '/_query')
    return paged(
      list(
        [...decisions.values()].filter(
          (row) => row.revisionId === revision.id && row.pageId === pageId,
        ),
      ),
    )
  if (method === 'GET' && (relationMatch || decisionMatch))
    return respond(
      original?.revisionId === revision.id &&
        (!('pageId' in original) || original.pageId === pageId)
        ? 200
        : 404,
      original || null,
    )
  if (readonly) return respond(403, null)
  if (!data.clientRequestId) return respond(400, null)
  const receiptKey = `${actor}/${revision.id}/${data.clientRequestId}`,
    fingerprint = JSON.stringify({ path, method, data }),
    receipt = receipts.get(receiptKey)
  if (receipt) {
    if (receipt.fingerprint !== fingerprint)
      return respond(409, null, 'PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT')
    return respond(
      200,
      receipt.kind === 'context'
        ? context()
        : receipt.kind === 'delete'
          ? true
          : receipt.kind === 'relation'
            ? relations.get(receipt.id) || null
            : decisions.get(receipt.id) || null,
    )
  }
  function accept(result: { id: string } | TraceContext | boolean, kind: string) {
    receipts.set(receiptKey, {
      fingerprint,
      kind,
      id: typeof result === 'object' ? result.id || '' : '',
    })
    return respond(200, result)
  }
  if (pageMatch?.[2] === 'context' && method === 'PUT') {
    const old = context(),
      input = data as unknown as TraceContextDraft
    if (old.configVersion !== data.expectedVersion)
      return respond(409, null, 'PROTOTYPE_HUB_PAGE_TRACE_CONFLICT')
    if (
      typeof input.entry !== 'boolean' ||
      !Array.isArray(input.references) ||
      input.references.length > 40 ||
      new Set(input.references.map((ref) => `${ref.kind}/${ref.id}`)).size !==
        input.references.length
    )
      return respond(400, null)
    if (
      input.references.some(
        (ref) =>
          !old.references.some(
            (previous) =>
              previous.kind === ref.kind &&
              previous.id === ref.id &&
              previous.expectedVersion === ref.expectedVersion,
          ) &&
          sources(ref.kind).find((source) => source.id === ref.id)?.configVersion !==
            ref.expectedVersion,
      )
    )
      return respond(409, null, 'PROTOTYPE_HUB_PAGE_TRACE_SOURCE_CHANGED')
    const value: TraceContext = {
      ...old,
      id: old.id || randomUUID(),
      entry: input.entry,
      references: input.references.map((ref) => ({
        ...ref,
        status: 'current',
        currentVersion: ref.expectedVersion,
        title: null,
      })),
      configVersion: old.configVersion + 1,
      createdAt: old.createdAt || now,
      updatedAt: now,
    }
    contexts.set(contextKey, value)
    return accept(context(), 'context')
  }
  if ((relationMatch || decisionMatch) && (!original || original.revisionId !== revision.id))
    return respond(404, null)
  if (original && original.configVersion !== data.expectedVersion)
    return respond(409, null, 'PROTOTYPE_HUB_PAGE_TRACE_CONFLICT')
  if (method === 'POST' && (relationMatch?.[2] || decisionMatch?.[2])) {
    ;(relationMatch ? relations : decisions).delete(original!.id)
    return accept(true, 'delete')
  }
  const identity = {
    id: original?.id || randomUUID(),
    projectId: revision.projectId,
    versionId: revision.versionId,
    revisionId: revision.id,
    configVersion: original ? original.configVersion + 1 : 0,
    createdAt: original?.createdAt || now,
    updatedAt: now,
  }
  if ((suffix === '/relations' && method === 'POST') || (relationMatch && method === 'PUT')) {
    if (
      !pageIds.has(String(data.fromPageId)) ||
      !pageIds.has(String(data.toPageId)) ||
      data.fromPageId === data.toPageId ||
      !String(data.label || '').trim()
    )
      return respond(400, null, 'PROTOTYPE_HUB_PAGE_TRACE_INVALID')
    const row: PageRelation = {
      ...identity,
      fromPageId: String(data.fromPageId),
      toPageId: String(data.toPageId),
      label: String(data.label),
      note: String(data.note || ''),
    }
    relations.set(row.id, row)
    return accept(row, 'relation')
  }
  if (
    pageMatch?.[2] === 'decisions' &&
    ((method === 'POST' && !pageMatch[3]) || (method === 'PUT' && decisionMatch))
  ) {
    if (!['title', 'decision', 'rationale'].every((key) => String(data[key] || '').trim()))
      return respond(400, null)
    const row: TraceDecision = {
      ...identity,
      pageId,
      title: String(data.title),
      decision: String(data.decision),
      rationale: String(data.rationale),
      authorId: original && 'authorId' in original ? original.authorId : actor,
      updatedBy: actor,
    }
    decisions.set(row.id, row)
    return accept(row, 'decision')
  }
  return respond(404, null)
}
