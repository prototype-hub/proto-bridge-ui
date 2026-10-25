import type { Router } from 'vue-router'
import { applicationUrl } from './urls'

const tokenPattern = /^[A-Za-z0-9_-]{43}$/

/** Undefined means no invitation; null preserves an explicit invalid intent without an OTP fallback. */
export function parseReviewInvitation(hash: string): string | null | undefined {
  if (hash !== '#reviewInvitation' && !hash.startsWith('#reviewInvitation=')) return undefined
  const value = hash.slice('#reviewInvitation='.length)
  return tokenPattern.test(value) ? value : null
}

/** Append a second # to a hash-router href, preserving its route instead of putting credentials in query. */
export function reviewInvitationUrl(
  router: Pick<Router, 'resolve'>,
  shareToken: string,
  invitationToken: string,
) {
  if (!tokenPattern.test(invitationToken)) throw new Error('Invalid invitation token')
  return `${applicationUrl(router, `/share/${encodeURIComponent(shareToken)}`)}#reviewInvitation=${invitationToken}`
}
