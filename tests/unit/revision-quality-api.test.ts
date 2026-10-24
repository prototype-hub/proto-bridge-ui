import { expect, it, vi } from 'vitest'
import { versionsApi } from '@/modules/protohub-manager-ui/api/version'
import { request } from '@/shared/api/client'
vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn().mockResolvedValue({ result: {} }) },
}))

it('checks an explicit encoded revision and preserves cancellation without querying current', async () => {
  const signal = new AbortController().signal
  await versionsApi.quality('v/id', 'r/id', { signal, silent: true })
  expect(request.get).toHaveBeenCalledExactlyOnceWith(
    '/prototype-hub/versions/v%2Fid/revisions/r%2Fid/quality',
    undefined,
    { signal, silent: true },
  )
})
