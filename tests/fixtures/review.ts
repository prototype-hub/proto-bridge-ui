import { resetThreads, threadResponse } from './review-thread'
import type { PrototypePage } from '../../src/modules/protohub-manager-ui/types'
import { createHash, randomUUID } from 'node:crypto'
import { resetInvitations, invitedChallenge, consumeInvitation } from './review-invitation'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ReviewIdentity, Share } from '../../src/modules/protohub-manager-ui/types'

// UI fixtures only: fixed codes and in-memory records never ship in production or prove DB security.
const enabled = new Set<string>()
const unverifiedAllowed = new Set<string>()
const commentsAllowed = new Set<string>()
const sessions = new Map<string, { scope: string; identity?: ReviewIdentity }>()
const challenges = new Map<
  string,
  { cookie: string; scope: string; identity: ReviewIdentity; invitationId?: string; email: string }
>()
export const reviewEnabled = (id: string) => enabled.has(id)
export const reviewUnverifiedAllowed = (id: string) => unverifiedAllowed.has(id)
export function resetReview() {
  resetInvitations()
  resetThreads()
  commentsAllowed.clear()
  enabled.clear()
  unverifiedAllowed.clear()
  sessions.clear()
  challenges.clear()
}
export function reviewPolicy(record: Share, input?: Record<string, unknown>) {
  if (input) {
    if (input.enabled === true) enabled.add(record.id)
    else enabled.delete(record.id)
    if (input.allowUnverified === true) unverifiedAllowed.add(record.id)
    else if (input.allowUnverified === false) unverifiedAllowed.delete(record.id)
    if (input.allowComment === true) commentsAllowed.add(record.id)
    else if (input.allowComment === false) commentsAllowed.delete(record.id)
    record.configVersion++
  }
  return {
    enabled: reviewEnabled(record.id),
    allowComment: reviewEnabled(record.id) && commentsAllowed.has(record.id),
    mailAvailable: true,
    allowUnverified: reviewUnverifiedAllowed(record.id),
    configVersion: record.configVersion,
  }
}
type Send = (
  res: ServerResponse,
  status: number,
  result: unknown,
  message?: string,
  code?: string,
) => void
export function reviewResponse(
  req: IncomingMessage,
  res: ServerResponse,
  record: Share,
  data: Record<string, unknown>,
  suffix: string,
  rid: string,
  grant: string,
  send: Send,
  pages: PrototypePage[] = [],
) {
  if (!suffix.startsWith('/review/')) return false
  if (
    !reviewEnabled(record.id) ||
    data.revisionId !== rid ||
    data.accessKey !== grant ||
    (req.method !== 'POST' &&
      !(req.method === 'PUT' && /\/threads\/[^/]+\/status$/.test(suffix))) ||
    req.headers['x-access-token']
  ) {
    send(res, 403, null, 'Review access unavailable')
    return true
  }
  const scope = `${record.id}:${rid}:${record.configVersion}`
  let cookie = req.headers.cookie?.match(/(?:^|;\s*)mock-review=([^;]+)/)?.[1]
  if (!cookie || sessions.get(cookie)?.scope !== scope) {
    cookie = randomUUID()
    sessions.set(cookie, { scope })
    res.setHeader(
      'Set-Cookie',
      `mock-review=${cookie}; HttpOnly; SameSite=Strict; Path=/api/prototype-hub/public/shares/${record.token}/review`,
    )
  }
  let selected = sessions.get(cookie)!
  let csrf = createHash('sha256').update(cookie).digest('hex')
  if (selected.identity && selected.identity.expiresAt <= Date.now()) selected.identity = undefined
  const context = () => ({
    revisionId: rid,
    enabled: true,
    allowComment: commentsAllowed.has(record.id),
    mailAvailable: true,
    allowUnverified: reviewUnverifiedAllowed(record.id),
    csrfToken: csrf,
    session: selected.identity || null,
  })
  const action = suffix.slice('/review/'.length)
  if (action === 'context') {
    send(res, 200, context())
    return true
  }
  if (req.headers['x-review-csrf'] !== csrf) {
    send(res, 403, null, 'Review access unavailable')
    return true
  }
  if (action.startsWith('threads')) {
    if (!commentsAllowed.has(record.id) || record.revisionMode !== 'fixed')
      send(res, 403, null, 'Feedback disabled', 'PROTOTYPE_HUB_REVIEW_COMMENTS_DISABLED')
    else if (!selected.identity)
      send(res, 403, null, 'Identity required', 'PROTOTYPE_HUB_REVIEW_SESSION_REQUIRED')
    else
      threadResponse(
        res,
        record.versionId,
        pages,
        data,
        action.slice('threads'.length),
        req.method!,
        send,
        { share: record, identity: selected.identity },
      )
    return true
  }
  if (action === 'unverified') {
    if (!reviewUnverifiedAllowed(record.id)) send(res, 403, null, 'Review access unavailable')
    else if (selected.identity?.verificationLevel === 'email')
      send(res, 409, null, 'Sign out the existing identity first')
    else if (selected.identity) send(res, 200, context())
    else if (
      typeof data.displayName !== 'string' ||
      !data.displayName.trim() ||
      data.displayName.trim().length > 100 ||
      (data.company !== undefined &&
        (typeof data.company !== 'string' || data.company.trim().length > 200)) ||
      'email' in data
    )
      send(res, 400, null, 'Invalid name or company')
    else {
      const identity: ReviewIdentity = {
        guestId: randomUUID(),
        displayName: data.displayName.trim(),
        company: typeof data.company === 'string' ? data.company.trim() || null : null,
        maskedEmail: null,
        verificationLevel: 'unverified',
        expiresAt: Date.now() + 8 * 3600000,
      }
      // The mock rotates only this scoped cookie, without putting credentials in any public response.
      sessions.delete(cookie)
      cookie = randomUUID()
      selected = { scope, identity }
      sessions.set(cookie, selected)
      csrf = createHash('sha256').update(cookie).digest('hex')
      res.setHeader(
        'Set-Cookie',
        `mock-review=${cookie}; HttpOnly; SameSite=Strict; Path=/api/prototype-hub/public/shares/${record.token}/review`,
      )
      send(res, 200, context())
    }
  } else if (action === 'challenges') {
    const email = String(data.email).trim().toLowerCase()
    if (
      data.invitationToken !== undefined &&
      (typeof data.invitationToken !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(data.invitationToken))
    ) {
      send(res, 400, null, 'Invalid invitation token')
      return true
    }
    if (data.invitationToken !== undefined && selected.identity) {
      send(res, 409, null, 'Sign out the existing identity first')
      return true
    }
    const invitationId =
      data.invitationToken === undefined
        ? undefined
        : invitedChallenge(data.invitationToken, record, email, rid)
    if (data.invitationToken !== undefined && !invitationId) {
      send(res, 403, null, 'Invitation unavailable', 'PROTOTYPE_HUB_REVIEW_INVITATION_INVALID')
      return true
    }
    const challengeId = randomUUID()
    const identity: ReviewIdentity = {
      guestId: createHash('sha256').update(`${record.projectId}:${email}`).digest('hex'),
      displayName: String(data.displayName),
      company: typeof data.company === 'string' ? data.company : null,
      maskedEmail: `${email[0]}***@${email.split('@')[1]}`,
      verificationLevel: 'email',
      expiresAt: Date.now() + 8 * 3600000,
    }
    challenges.set(challengeId, { cookie, scope, identity, invitationId, email })
    send(res, 200, { challengeId, expiresAt: Date.now() + 300000, resendAfter: Date.now() + 60000 })
  } else if (action === 'verify') {
    const challenge = challenges.get(String(data.challengeId))
    if (
      !challenge ||
      challenge.cookie !== cookie ||
      challenge.scope !== scope ||
      data.code !== '123456'
    )
      send(res, 400, null, 'Invalid code', 'PROTOTYPE_HUB_REVIEW_CODE_INVALID')
    else if (
      challenge.invitationId &&
      !consumeInvitation(challenge.invitationId, record, challenge.email, rid)
    )
      send(res, 403, null, 'Invitation unavailable', 'PROTOTYPE_HUB_REVIEW_INVITATION_INVALID')
    else {
      challenges.delete(String(data.challengeId))
      selected.identity = challenge.identity
      send(res, 200, context())
    }
  } else if (action === 'logout') {
    selected.identity = undefined
    send(res, 200, { loggedOut: true })
  } else send(res, 404, null, 'Unknown review endpoint')
  return true
}
