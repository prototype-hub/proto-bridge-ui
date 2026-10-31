import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type {
  ReviewAssociation,
  ReviewGuest,
  ReviewThread,
  Share,
} from '../../src/modules/protohub-manager-ui/types'

// UI fixtures only. Real DB locking, permissions and generation semantics need backend integration.
const rows = new Map<string, ReviewAssociation>()
const receipts = new Map<string, { payload: string; id: string }>()
export function resetAssociations() {
  rows.clear()
  receipts.clear()
  sourceOwners.clear()
}
interface Source {
  thread: ReviewThread
  shareId: string
  versionId: string
  owner: string
}
export function associatedAccess(source: Source, guestId: string, share: Share) {
  return [...rows.values()].some(
    (row) =>
      row.status === 'active' &&
      row.sourceThreadId &&
      row.shareId === share.id &&
      row.revisionId === source.thread.revisionId &&
      row.targetGuestId === guestId &&
      row.shareConfigVersion === share.configVersion &&
      row.versionId === source.versionId &&
      row.id &&
      source.owner === sourceOwners.get(row.id),
  )
}
const sourceOwners = new Map<string, string>()
type Send = (
  res: ServerResponse,
  status: number,
  result: unknown,
  message?: string,
  code?: string,
) => void
export function associationResponse(
  res: ServerResponse,
  projectId: string,
  suffix: string,
  method: string,
  input: Record<string, unknown>,
  source: Source | undefined,
  shares: Share[],
  guests: ReviewGuest[],
  send: Send,
) {
  const existing = [...rows.values()].find((row) => row.id === suffix.split('/')[1])
  const selected = source
  if (!selected && !existing) {
    send(res, 404, null, 'Source unavailable')
    return
  }
  if (selected && selected.thread.verificationLevel !== 'unverified') {
    send(res, 400, null, 'Unverified source required')
    return
  }
  const share = shares.find(
    (row) => row.id === (selected?.shareId || existing?.shareId) && row.projectId === projectId,
  )
  if (!share) {
    send(res, 404, null, 'Source unavailable')
    return
  }
  const scoped = [...rows.values()].filter(
    (row) =>
      row.shareId === share.id &&
      row.revisionId === (selected?.thread.revisionId || existing?.revisionId) &&
      sourceOwners.get(row.id) === (selected?.owner || sourceOwners.get(existing!.id)),
  )
  const active = scoped.find((row) => row.status !== 'revoked') || null
  const available = !share.revoked && (!share.expiresAt || share.expiresAt > Date.now())
  if (suffix === '/_detail') {
    send(res, 200, {
      sourceThread: selected!.thread,
      versionId: selected!.versionId,
      shareId: share.id,
      revisionId: selected!.thread.revisionId,
      shareConfigVersion: share.configVersion,
      eligible: available,
      unavailableReason: available ? null : 'SHARE_UNAVAILABLE',
      activeAssociation: active,
    })
    return
  }
  if (suffix === '/_query') {
    const pageIndex = Number(input.pageIndex),
      pageSize = Number(input.pageSize)
    const history = scoped.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    send(res, 200, {
      data: history.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      total: history.length,
      pageIndex,
      pageSize,
    })
    return
  }
  const key = JSON.stringify([projectId, suffix, input.clientRequestId]),
    payload = JSON.stringify(input),
    receipt = receipts.get(key)
  if (receipt) {
    send(
      res,
      receipt.payload === payload ? 200 : 409,
      receipt.payload === payload ? rows.get(receipt.id) : null,
    )
    return
  }
  if (!input.clientRequestId) {
    send(res, 400, null, 'Request key required')
    return
  }
  if (suffix.endsWith('/revoke') && method === 'PUT' && existing) {
    if (input.expectedVersion !== existing.configVersion) {
      send(res, 409, null, 'Association changed')
      return
    }
    existing.status = 'revoked'
    existing.configVersion++
    existing.revokedBy = 'u1'
    existing.revokedByName = 'Administrator'
    existing.revokedAt = Date.now()
    existing.revokeReason = String(input.reason)
    receipts.set(key, { payload, id: existing.id })
    send(res, 200, existing)
    return
  }
  const target = guests.find(
    (row) => row.id === input.targetGuestId && row.enabled && row.verificationLevel === 'email',
  )
  if (!target || !available || !String(input.evidenceReference || '').trim()) {
    send(res, 400, null, 'Invalid association')
    return
  }
  if (
    active ||
    share.configVersion !== input.expectedShareVersion ||
    target.configVersion !== input.expectedTargetVersion
  ) {
    send(res, 409, null, 'Association changed')
    return
  }
  const row: ReviewAssociation = {
    id: randomUUID(),
    sourceThreadId: selected!.thread.id,
    versionId: selected!.versionId,
    shareId: share.id,
    revisionId: selected!.thread.revisionId,
    targetGuestId: target.id,
    targetGuest: target,
    status: 'active',
    invalidReason: null,
    configVersion: 0,
    shareConfigVersion: share.configVersion,
    targetGuestConfigVersion: target.configVersion,
    evidenceReference: String(input.evidenceReference),
    createdBy: 'u1',
    createdByName: 'Administrator',
    createdAt: Date.now(),
    revokedBy: null,
    revokedByName: null,
    revokedAt: null,
    revokeReason: null,
  }
  rows.set(row.id, row)
  sourceOwners.set(row.id, selected!.owner)
  receipts.set(key, { payload, id: row.id })
  send(res, 200, row)
}
