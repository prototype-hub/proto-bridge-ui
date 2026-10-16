import { it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSession } from '@/app/stores/session'
import { sessionApi } from '@/modules/authentication-manager-ui'
import { token } from '@/shared/auth/token'
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
  token.clear()
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
it('persists the backend credential only when requested and clears it even if logout fails', async () => {
  const session = useSession()
  vi.mocked(sessionApi.login).mockResolvedValue({ token: 'remembered' })
  await session.login({ username: 'user', password: 'password', expires: -1 }, { rememberMe: true })
  expect(token.getRemembered()).toBe('remembered')
  expect(localStorage.getItem('proto-bridge-ui:token')).toBeNull()
  vi.mocked(sessionApi.logout).mockRejectedValueOnce(new Error('offline'))
  await expect(session.logout()).rejects.toThrow('offline')
  expect(token.get()).toBeNull()
})
it('does not persist failed login credentials or revive a token from a late login after logout', async () => {
  const session = useSession()
  vi.mocked(sessionApi.login).mockRejectedValueOnce(new Error('Rejected'))
  await expect(
    session.login({ username: 'user', password: 'wrong', expires: -1 }, { rememberMe: true }),
  ).rejects.toThrow('Rejected')
  expect(token.get()).toBeNull()
  let complete!: (value: { token: string }) => void
  vi.mocked(sessionApi.login).mockImplementationOnce(
    () => new Promise((resolve) => (complete = resolve)),
  )
  const pending = session.login(
    { username: 'user', password: 'password', expires: -1 },
    { rememberMe: true },
  )
  vi.mocked(sessionApi.logout).mockResolvedValueOnce({ success: true, status: 200, result: true })
  await session.logout()
  complete({ token: 'too-late' })
  await expect(pending).rejects.toMatchObject({ status: 401 })
  expect(token.get()).toBeNull()
})
