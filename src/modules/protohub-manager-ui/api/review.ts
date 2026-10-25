import { config } from '@/shared/config'
import { normalize } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { t, i18n } from '@/shared/i18n'
import type { ReviewContext, ReviewChallenge } from '../types'

export interface ReviewGrant {
  token: string
  revisionId: string
  accessKey: string
}
export interface ReviewProfile {
  email: string
  displayName: string
  company?: string
  invitationToken?: string
}
export type UnverifiedReviewProfile = Pick<ReviewProfile, 'displayName' | 'company'>

/** This is the only public client that sends cookies, within its own same-origin review scope. */
export async function reviewRequest<T>(
  grant: ReviewGrant,
  action: string,
  input: object,
  csrf?: string,
  signal?: AbortSignal,
  method: 'POST' | 'PUT' = 'POST',
): Promise<T> {
  const base = new URL(config.apiBase.replace(/\/$/, '') + '/', window.location.origin)
  if (
    base.origin !== window.location.origin ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new ApiError(t('proto.reviewUnavailable'))
  const url = `${base.pathname}prototype-hub/public/shares/${encodeURIComponent(grant.token)}/review/${action}`
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timeout = setTimeout(abort, 30000)
  try {
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': i18n.global.locale.value,
        ...(csrf ? { 'X-Review-CSRF': csrf } : {}),
      },
      body: JSON.stringify({ revisionId: grant.revisionId, accessKey: grant.accessKey, ...input }),
    })
    const body: unknown = await response.json()
    const result = normalize<T>(body, response.status)
    if (!response.ok) throw new ApiError(t('proto.reviewUnavailable'), response.status)
    return result.result
  } catch (cause) {
    if (cause instanceof ApiError) throw cause
    throw new ApiError(
      t('proto.reviewUnavailable'),
      0,
      undefined,
      undefined,
      undefined,
      !!signal?.aborted,
    )
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
export const reviewApi = {
  context: (grant: ReviewGrant, signal?: AbortSignal) =>
    reviewRequest<ReviewContext>(grant, 'context', {}, undefined, signal),
  challenge: (grant: ReviewGrant, profile: ReviewProfile, csrf: string, signal?: AbortSignal) =>
    reviewRequest<ReviewChallenge>(grant, 'challenges', profile, csrf, signal),
  verify: (
    grant: ReviewGrant,
    challengeId: string,
    code: string,
    csrf: string,
    signal?: AbortSignal,
  ) => reviewRequest<ReviewContext>(grant, 'verify', { challengeId, code }, csrf, signal),
  unverified: (
    grant: ReviewGrant,
    profile: UnverifiedReviewProfile,
    csrf: string,
    signal?: AbortSignal,
  ) =>
    reviewRequest<ReviewContext>(
      grant,
      'unverified',
      { displayName: profile.displayName, company: profile.company },
      csrf,
      signal,
    ),
  logout: (grant: ReviewGrant, csrf: string, signal?: AbortSignal) =>
    reviewRequest<{ loggedOut: true }>(grant, 'logout', {}, csrf, signal),
}
