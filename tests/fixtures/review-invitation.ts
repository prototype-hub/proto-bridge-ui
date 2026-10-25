import { randomBytes, randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { Share, ReviewInvitation } from '../../src/modules/protohub-manager-ui/types'

// In-memory UI fixtures model invitation binding and projection, not transactional/security guarantees.
interface StoredInvitation {
  invitation: ReviewInvitation
  token: string
  shareId: string
  shareVersion: number
  revisionId: string
  email: string
}
const invitations = new Map<string, StoredInvitation>()
export const resetInvitations = () => invitations.clear()
function projection(value: StoredInvitation, share: Share, enabled: boolean): ReviewInvitation {
  const row = value.invitation
  const status =
    row.status !== 'pending'
      ? row.status
      : row.expiresAt <= Date.now()
        ? 'expired'
        : !enabled ||
            share.revoked ||
            !share.enabled ||
            share.revisionMode !== 'fixed' ||
            share.configVersion !== value.shareVersion ||
            share.revisionId !== value.revisionId
          ? 'invalidated'
          : 'pending'
  return { ...row, status }
}
export function invitedChallenge(token: unknown, share: Share, email: string, rid: string) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined
  return [...invitations.values()].find(
    (value) =>
      value.token === token &&
      value.shareId === share.id &&
      value.email === email &&
      value.revisionId === rid &&
      projection(value, share, true).status === 'pending',
  )?.invitation.id
}
export function consumeInvitation(id: string, share: Share, email: string, rid: string) {
  const value = invitations.get(id)
  if (!value || invitedChallenge(value.token, share, email, rid) !== id) return false
  value.invitation.status = 'consumed'
  value.invitation.consumedAt = Date.now()
  value.invitation.configVersion++
  return true
}
type Send = (
  res: ServerResponse,
  status: number,
  result: unknown,
  message?: string,
  code?: string,
) => void
export function invitationManagement(
  res: ServerResponse,
  share: Share,
  path: string,
  method: string,
  data: Record<string, unknown>,
  enabled: boolean,
  send: Send,
) {
  const suffix = path.split('/review-invitations')[1] || ''
  if (suffix === '' && method === 'POST') {
    if (
      data.expectedShareVersion !== share.configVersion ||
      !enabled ||
      share.revoked ||
      !share.enabled ||
      share.revisionMode !== 'fixed' ||
      !share.revisionId ||
      (share.expiresAt && share.expiresAt <= Date.now())
    )
      send(res, 409, null, 'Share changed')
    else {
      const email = String(data.email).trim().toLowerCase(),
        id = randomUUID(),
        token = randomBytes(32).toString('base64url')
      const invitation: ReviewInvitation = {
        id,
        maskedEmail: `${email[0]}***@${email.split('@')[1]}`,
        status: 'pending',
        configVersion: 0,
        createdAt: Date.now(),
        expiresAt: Math.min(Date.now() + 86400000, share.expiresAt || Infinity),
        consumedAt: null,
      }
      invitations.set(id, {
        invitation,
        token,
        shareId: share.id,
        shareVersion: share.configVersion,
        revisionId: share.revisionId,
        email,
      })
      send(res, 200, { invitation, invitationToken: token })
    }
  } else if (suffix === '/_query' && method === 'POST') {
    const index = data.pageIndex,
      size = data.pageSize
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 10000 ||
      typeof size !== 'number' ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > 100
    )
      send(res, 400, null, 'Invalid page')
    else {
      const rows = [...invitations.values()]
        .filter((value) => value.shareId === share.id)
        .map((value) => projection(value, share, enabled))
        .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
      send(res, 200, {
        data: rows.slice(index * size, (index + 1) * size),
        total: rows.length,
        pageIndex: index,
        pageSize: size,
      })
    }
  } else if (/^\/[^/]+\/revoke$/.test(suffix) && method === 'PUT') {
    const value = invitations.get(decodeURIComponent(suffix.split('/')[1]!))
    if (!value || value.shareId !== share.id) send(res, 404, null, 'Invitation unavailable')
    else if (data.expectedVersion !== value.invitation.configVersion)
      send(res, 409, null, 'Invitation changed')
    else if (projection(value, share, enabled).status === 'revoked')
      send(res, 200, projection(value, share, enabled))
    else if (projection(value, share, enabled).status !== 'pending')
      send(res, 409, null, 'Invitation changed')
    else {
      value.invitation.status = 'revoked'
      value.invitation.configVersion++
      send(res, 200, projection(value, share, enabled))
    }
  } else send(res, 404, null, 'Unknown invitation action')
}
