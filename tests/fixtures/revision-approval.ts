import type { ServerResponse } from 'node:http'
import type { Revision } from '../../src/modules/protohub-manager-ui/types'
import type {
  ApprovalAction,
  ApprovalEvent,
  RevisionApproval,
} from '../../src/modules/protohub-manager-ui/types/revision-approval'
// Wire/UI fixture. Real database, identity and transaction guarantees are verified separately.
const events = new Map<string, ApprovalEvent[]>(),
  receipts = new Map<string, string>()
export function resetRevisionApprovals() {
  events.clear()
  receipts.clear()
}
export function approvalStatus(revision: Revision): RevisionApproval {
  const rows = events.get(revision.id) || [],
    latest = rows.at(-1)
  return {
    projectId: revision.projectId,
    versionId: revision.versionId,
    revisionId: revision.id,
    configVersion: latest?.configVersion || 0,
    approved: latest?.approved || false,
    published: latest?.published || false,
    approval: rows.find((row) => row.id === latest?.approvalId) || null,
    publication: rows.find((row) => row.id === latest?.publicationId) || null,
    revision: {
      versionName: revision.versionName,
      description: revision.description,
      entryFile: revision.entryFile,
      manifestSha256: revision.manifestSha256,
      fileCount: revision.fileCount,
      totalBytes: revision.totalBytes,
      createTime: revision.createdAt,
    },
  }
}
type Send = (
  res: ServerResponse,
  status: number,
  result: unknown,
  message?: string,
  code?: string,
) => void
export function revisionApprovalResponse(
  path: string,
  method: string,
  data: Record<string, unknown>,
  readonly: boolean,
  actor: string,
  revisions: Map<string, Revision>,
  res: ServerResponse,
  send: Send,
  now: number,
) {
  const match = path.match(
    /^\/prototype-hub\/versions\/([^/]+)\/revisions\/([^/]+)\/approval(\/_act|\/_history)?$/,
  )
  if (!match) return false
  const revision = revisions.get(decodeURIComponent(match[2]!))
  if (!revision || revision.versionId !== decodeURIComponent(match[1]!)) {
    send(res, 404, null, 'Revision unavailable')
    return true
  }
  const status = approvalStatus(revision),
    rows = events.get(revision.id) || []
  if (method === 'GET' && !match[3]) {
    send(res, 200, status)
    return true
  }
  if (method === 'POST' && match[3] === '/_history') {
    const pageIndex = Number(data.pageIndex),
      pageSize = Number(data.pageSize)
    if (
      !Number.isSafeInteger(pageIndex) ||
      pageIndex < 0 ||
      pageIndex > 10000 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      send(res, 400, null)
      return true
    }
    send(res, 200, {
      data: [...rows].reverse().slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      total: rows.length,
      pageIndex,
      pageSize,
    })
    return true
  }
  if (method !== 'POST' || match[3] !== '/_act') {
    send(res, 405, null)
    return true
  }
  if (readonly) {
    send(res, 403, null, 'Access denied')
    return true
  }
  const action = data.action as ApprovalAction
  if (
    !['approve', 'revoke', 'publish', 'withdraw'].includes(action) ||
    Object.keys(data).some(
      (k) => !['action', 'expectedVersion', 'clientRequestId', 'note'].includes(k),
    ) ||
    !Number.isSafeInteger(data.expectedVersion) ||
    Number(data.expectedVersion) < 0 ||
    typeof data.note !== 'string' ||
    data.note.length > 2000 ||
    !/^[\x21-\x7e]{1,128}$/.test(String(data.clientRequestId))
  ) {
    send(res, 400, null)
    return true
  }
  const key = `${actor}/${revision.id}/${String(data.clientRequestId)}`,
    payload = JSON.stringify(data),
    receipt = receipts.get(key)
  if (receipt) {
    send(res, receipt === payload ? 200 : 409, receipt === payload ? status : null)
    return true
  }
  const allowed =
    action === 'approve'
      ? !status.approved
      : action === 'revoke'
        ? status.approved
        : action === 'publish'
          ? status.approved && !status.published
          : status.published
  if (data.expectedVersion !== status.configVersion || !allowed) {
    send(res, 409, null, 'State changed')
    return true
  }
  const id = `approval-${revision.id}-${status.configVersion + 1}`
  const row: ApprovalEvent = {
    id,
    projectId: revision.projectId,
    versionId: revision.versionId,
    revisionId: revision.id,
    configVersion: status.configVersion + 1,
    action,
    actorId: actor,
    actorName: 'Test User',
    createTime: now,
    note: data.note,
    approved: action === 'approve' || (action !== 'revoke' && status.approved),
    published: action === 'publish' || (action === 'approve' && status.published),
    approvalId:
      action === 'approve' ? id : action === 'revoke' ? null : status.approval?.id || null,
    publicationId: action === 'publish' ? id : null,
  }
  rows.push(row)
  events.set(revision.id, rows)
  receipts.set(key, payload)
  send(res, 200, approvalStatus(revision))
  return true
}
