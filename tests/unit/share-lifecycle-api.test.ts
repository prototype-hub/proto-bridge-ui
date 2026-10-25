import { expect, it, vi } from 'vitest'
import { sharesApi } from '@/modules/protohub-manager-ui/api/share'
import { request } from '@/shared/api/client'
vi.mock('@/shared/api/client', () => ({ request: { put: vi.fn(), post: vi.fn() } }))
it('uses the existing authenticated share action namespace and sends version preconditions for each write', async () => {
  const response = { success: true as const, status: 200, result: { id: 'id' } }
  vi.mocked(request.put).mockResolvedValue(response)
  vi.mocked(request.post).mockResolvedValue(response)
  const input = {
    expectedVersion: 7,
    revisionMode: 'latest' as const,
    passwordAction: 'remove' as const,
    description: null,
    expiresAt: null,
  }
  expect(await sharesApi.update('id/with space', input)).toEqual(response.result)
  expect(request.put).toHaveBeenLastCalledWith(
    '/prototype-hub/shares/id%2Fwith%20space',
    input,
    undefined,
  )
  await sharesApi.enabled('id', 8, false)
  expect(request.put).toHaveBeenLastCalledWith(
    '/prototype-hub/shares/id/enabled',
    { expectedVersion: 8, enabled: false },
    undefined,
  )
  await sharesApi.revoke('id', 9)
  expect(request.post).toHaveBeenLastCalledWith(
    '/prototype-hub/shares/id/revoke',
    { expectedVersion: 9 },
    undefined,
  )
  await sharesApi.rotate('id', 10)
  expect(request.post).toHaveBeenLastCalledWith(
    '/prototype-hub/shares/id/rotate-link',
    { expectedVersion: 10 },
    undefined,
  )
})
it.each([false, true])(
  'sends an explicit unverified policy flag (%s) with the current CAS version',
  async (allowUnverified) => {
    vi.mocked(request.put).mockResolvedValue({
      success: true,
      status: 200,
      result: {
        enabled: true,
        mailAvailable: true,
        configVersion: 12,
        allowUnverified,
        allowComment: false,
      },
    })
    const options = { signal: new AbortController().signal, silent: true }
    await sharesApi.setReviewPolicy('id/with space', true, 11, allowUnverified, false, options)
    expect(request.put).toHaveBeenLastCalledWith(
      '/prototype-hub/shares/id%2Fwith%20space/review',
      {
        enabled: true,
        expectedVersion: 11,
        allowUnverified,
        allowComment: false,
      },
      options,
    )
  },
)
