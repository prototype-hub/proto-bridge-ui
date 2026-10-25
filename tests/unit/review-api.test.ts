import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reviewApi } from '@/modules/protohub-manager-ui/api/review'
import { config } from '@/shared/config'
const grant = { token: 'share/id', revisionId: 'r1', accessKey: 'public-grant' }
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: {} }),
    }),
  ),
)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('uses only same-origin review cookies, JSON grant body and explicit CSRF, without platform headers', async () => {
  await reviewApi.challenge(
    grant,
    { email: 'visitor@example.invalid', displayName: 'Visitor' },
    'csrf-value',
  )
  expect(fetch).toHaveBeenCalledOnce()
  const [url, options] = vi.mocked(fetch).mock.calls[0]!
  expect(url).toBe('/api/prototype-hub/public/shares/share%2Fid/review/challenges')
  expect(options).toMatchObject({
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
  })
  expect(options!.headers).toMatchObject({
    'Content-Type': 'application/json',
    'X-Review-CSRF': 'csrf-value',
  })
  expect(options!.headers).not.toHaveProperty('X-Access-Token')
  expect(options!.headers).not.toHaveProperty('Cookie')
  expect(options!.headers).not.toHaveProperty('Origin')
  expect(JSON.parse(options!.body as string)).toEqual({
    revisionId: 'r1',
    accessKey: 'public-grant',
    email: 'visitor@example.invalid',
    displayName: 'Visitor',
  })
  expect(String(url)).not.toContain('public-grant')
})
it('bootstraps without a CSRF header and sends no cookie/token in JSON', async () => {
  await reviewApi.context(grant)
  const options = vi.mocked(fetch).mock.calls[0]![1]!
  expect(options.headers).not.toHaveProperty('X-Review-CSRF')
  expect(JSON.parse(options.body as string)).toEqual({
    revisionId: 'r1',
    accessKey: 'public-grant',
  })
})
it('rejects a cross-origin API deployment instead of sending review cookies there', async () => {
  const original = config.apiBase
  config.apiBase = 'https://other.example.invalid/api'
  try {
    await expect(reviewApi.context(grant)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    config.apiBase = original
  }
})
it('propagates cancellation and bounds fetch waiting', async () => {
  vi.useFakeTimers()
  let signal!: AbortSignal
  vi.mocked(fetch).mockImplementationOnce(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        signal = options!.signal!
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      }),
  )
  const request = reviewApi.context(grant)
  const rejected = expect(request).rejects.toThrow()
  await vi.advanceTimersByTimeAsync(30000)
  expect(signal.aborted).toBe(true)
  await rejected
})
it('preserves generic server error codes for localized UI without retrying an ambiguous send', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status: 429,
    json: async () => ({ success: false, status: 429, code: 'RATE_LIMIT' }),
  } as Response)
  await expect(
    reviewApi.challenge(grant, { email: 'v@example.invalid', displayName: 'V' }, 'csrf'),
  ).rejects.toMatchObject({ status: 429 })
  expect(fetch).toHaveBeenCalledOnce()
})
it('creates an unverified identity only through its explicit CSRF action, with no email or OTP payload', async () => {
  const profile = {
    displayName: 'Visitor',
    company: 'Self declared',
    email: 'do-not-send@example.invalid',
  }
  await reviewApi.unverified(grant, profile, 'csrf')
  const [url, options] = vi.mocked(fetch).mock.calls[0]!
  expect(url).toBe('/api/prototype-hub/public/shares/share%2Fid/review/unverified')
  expect(options).toMatchObject({
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
  })
  expect(options!.headers).toMatchObject({ 'X-Review-CSRF': 'csrf' })
  expect(options!.headers).not.toHaveProperty('X-Access-Token')
  expect(JSON.parse(options!.body as string)).toEqual({
    revisionId: 'r1',
    accessKey: 'public-grant',
    displayName: 'Visitor',
    company: 'Self declared',
  })
  expect(fetch).toHaveBeenCalledOnce()
})
