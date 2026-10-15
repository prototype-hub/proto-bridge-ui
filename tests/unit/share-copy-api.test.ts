import { expect, it, vi } from 'vitest'
import { sharesApi } from '@/modules/protohub-manager-ui/api/share'
import { request } from '@/shared/api/client'
vi.mock('@/shared/api/client', () => ({ request: { post: vi.fn() } }))
it('posts exact raw password JSON through the authenticated management client and reads boolean results', async () => {
  const controller = new AbortController()
  for (const result of [true, false]) {
    vi.mocked(request.post).mockResolvedValueOnce({ success: true, status: 200, result })
    expect(
      await sharesApi.verifyPassword('id/with space', ' raw password ', {
        signal: controller.signal,
        silent: true,
      }),
    ).toBe(result)
    expect(request.post).toHaveBeenLastCalledWith(
      '/prototype-hub/shares/id%2Fwith%20space/verify-password',
      { password: ' raw password ' },
      { signal: controller.signal, silent: true },
    )
  }
})
