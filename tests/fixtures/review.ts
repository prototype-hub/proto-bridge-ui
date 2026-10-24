import { createHash, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ReviewIdentity, Share } from '../../src/modules/protohub-manager-ui/types'

// UI fixtures only: fixed codes and in-memory records never ship in production or prove DB security.
const enabled = new Set<string>()
const sessions = new Map<string, { scope: string; identity?: ReviewIdentity }>()
const challenges = new Map<string, { cookie: string; scope: string; identity: ReviewIdentity }>()
export const reviewEnabled = (id: string) => enabled.has(id)
export function resetReview() {
  enabled.clear()
  sessions.clear()
  challenges.clear()
}
export function reviewPolicy(record: Share, input?: Record<string, unknown>) {
  if (input) {
    if (input.enabled === true) enabled.add(record.id)
    else enabled.delete(record.id)
    record.configVersion++
  }
  return {
    enabled: reviewEnabled(record.id),
    mailAvailable: true,
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
) {
  if (!suffix.startsWith('/review/')) return false
  if (
    !reviewEnabled(record.id) ||
    data.revisionId !== rid ||
    data.accessKey !== grant ||
    req.method !== 'POST' ||
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
  const selected = sessions.get(cookie)!
  const csrf = createHash('sha256').update(cookie).digest('hex')
  const context = () => ({
    revisionId: rid,
    enabled: true,
    mailAvailable: true,
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
  if (action === 'challenges') {
    const email = String(data.email).trim().toLowerCase()
    const challengeId = randomUUID()
    const identity: ReviewIdentity = {
      guestId: createHash('sha256').update(`${record.projectId}:${email}`).digest('hex'),
      displayName: String(data.displayName),
      company: typeof data.company === 'string' ? data.company : null,
      maskedEmail: `${email[0]}***@${email.split('@')[1]}`,
      verificationLevel: 'email',
      expiresAt: Date.now() + 8 * 3600000,
    }
    challenges.set(challengeId, { cookie, scope, identity })
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
