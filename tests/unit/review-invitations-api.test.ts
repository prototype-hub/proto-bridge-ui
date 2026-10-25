import { beforeEach, expect, it, vi } from 'vitest'
import { reviewInvitationsApi } from '@/modules/protohub-manager-ui/api/review-invitation'
import { reviewApi } from '@/modules/protohub-manager-ui/api/review'
import { request } from '@/shared/api/client'
vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  request: { post: vi.fn(), put: vi.fn() },
}))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(request.post).mockResolvedValue({ success: true, status: 200, result: {} })
  vi.mocked(request.put).mockResolvedValue({ success: true, status: 200, result: {} })
})
it('uses bounded share-scoped management with distinct share and invitation CAS versions', async () => {
  const options = { signal: new AbortController().signal, silent: true }
  await reviewInvitationsApi.create('s/id', 'recipient@example.invalid', 8, options)
  expect(request.post).toHaveBeenLastCalledWith(
    '/prototype-hub/shares/s%2Fid/review-invitations',
    { email: 'recipient@example.invalid', expectedShareVersion: 8 },
    options,
  )
  await reviewInvitationsApi.query('s/id', { pageIndex: 2, pageSize: 20 }, options)
  expect(request.post).toHaveBeenLastCalledWith(
    '/prototype-hub/shares/s%2Fid/review-invitations/_query',
    { pageIndex: 2, pageSize: 20 },
    options,
  )
  await reviewInvitationsApi.revoke('s/id', 'i/id', 3, options)
  expect(request.put).toHaveBeenLastCalledWith(
    '/prototype-hub/shares/s%2Fid/review-invitations/i%2Fid/revoke',
    { expectedVersion: 3 },
    options,
  )
})
it('sends an invitation only in explicit OTP JSON and never forwards it into verify or name-only identity', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, result: {} }) })
  vi.stubGlobal('fetch', fetcher)
  try {
    const grant = { token: 'open', revisionId: 'r1', accessKey: 'grant' },
      invitationToken = 'A'.repeat(43)
    await reviewApi.challenge(
      grant,
      { email: 'recipient@example.invalid', displayName: 'Visitor', invitationToken },
      'csrf',
    )
    expect(fetcher.mock.calls[0]![0]).toBe(
      '/api/prototype-hub/public/shares/open/review/challenges',
    )
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ invitationToken })
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      credentials: 'same-origin',
      headers: { 'X-Review-CSRF': 'csrf' },
    })
    await reviewApi.verify(grant, 'challenge', '123456', 'csrf')
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({
      revisionId: 'r1',
      accessKey: 'grant',
      challengeId: 'challenge',
      code: '123456',
    })
    const profile = { displayName: 'Visitor', email: 'recipient@example.invalid', invitationToken }
    await reviewApi.unverified(grant, profile, 'csrf')
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toEqual({
      revisionId: 'r1',
      accessKey: 'grant',
      displayName: 'Visitor',
    })
  } finally {
    vi.unstubAllGlobals()
  }
})
