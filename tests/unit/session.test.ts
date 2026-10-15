import { it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSession } from '@/app/stores/session'
import { sessionApi } from '@/modules/authentication-manager-ui'
vi.mock('@/modules/authentication-manager-ui', () => ({
  sessionApi: {
    user: vi.fn(),
    authorization: vi.fn(),
    menus: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}))
beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(sessionApi.user).mockResolvedValue({ id: 'u', name: 'User', username: 'user' })
  vi.mocked(sessionApi.authorization).mockResolvedValue({
    permissions: [{ id: 'protohub-version', actions: ['query'] }],
  })
  vi.mocked(sessionApi.menus).mockResolvedValue([])
  vi.clearAllMocks()
})
it('single-flights initialization and keeps standalone preview independent from menus', async () => {
  const session = useSession()
  await Promise.all([session.initialize(false), session.initialize(false)])
  expect(sessionApi.user).toHaveBeenCalledTimes(1)
  expect(sessionApi.menus).not.toHaveBeenCalled()
  expect(session.can('protohub-version:query')).toBe(true)
  await session.initialize()
  expect(sessionApi.menus).toHaveBeenCalledTimes(1)
  const removed = vi.fn()
  session.registerRoutes(removed)
  session.clear()
  expect(removed).toHaveBeenCalledTimes(1)
  expect(session.initialized).toBe(false)
  expect(session.permissions.size).toBe(0)
})
it('does not restore a stale session after logout', async () => {
  let resolve: (value: Awaited<ReturnType<typeof sessionApi.user>>) => void = () => {}
  vi.mocked(sessionApi.user).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  const session = useSession()
  const pending = session.initialize(false)
  session.clear()
  resolve({ id: 'u', name: 'User', username: 'user' })
  await expect(pending).rejects.toThrow()
  expect(session.user).toBeUndefined()
})
