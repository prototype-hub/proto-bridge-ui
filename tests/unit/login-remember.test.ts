import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useLogin } from '@/modules/authentication-manager-ui/views/auth/hooks/useLogin'
import { token } from '@/shared/auth/token'
import { ApiError } from '@/shared/api/errors'
import { useSession } from '@/app/stores/session'

const { api } = vi.hoisted(() => ({
  api: {
    login: vi.fn(),
    logout: vi.fn(),
    user: vi.fn(),
    authorization: vi.fn(),
    menus: vi.fn(),
    config: vi.fn(),
    captchaConfig: vi.fn(),
    captcha: vi.fn(),
  },
}))
vi.mock('@/modules/authentication-manager-ui', () => ({ sessionApi: api }))
vi.mock('@/modules/authentication-manager-ui/api/auth/session', () => ({ sessionApi: api }))

const wrappers: ReturnType<typeof mount>[] = []
async function loginPage(redirect = '/') {
  let state!: ReturnType<typeof useLogin>
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/login', '/', '/system/user'].map((path) => ({
      path,
      component: { render: () => null },
    })),
  })
  await router.push({ path: '/login', query: { redirect } })
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useLogin()
        return () => h('div')
      },
    }),
    {
      global: { plugins: [createPinia(), router] },
    },
  )
  wrappers.push(wrapper)
  await flushPromises()
  return { state, router, wrapper }
}
beforeEach(() => {
  vi.resetAllMocks()
  token.clear()
  api.config.mockResolvedValue({})
  api.captchaConfig.mockResolvedValue({ enabled: false })
  api.user.mockResolvedValue({ id: 'u', name: 'User', username: 'user', status: 1 })
  api.authorization.mockResolvedValue({ permissions: [] })
  api.menus.mockResolvedValue([])
  api.login.mockResolvedValue({ token: 'backend-token' })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  token.clear()
})

describe('remember me login flow', () => {
  it.each([false, true])(
    'keeps rememberMe=%s local and sends only the backend lifetime contract',
    async (rememberMe) => {
      const { state, router } = await loginPage()
      expect(state.form.rememberMe).toBe(false)
      Object.assign(state.form, { username: ' user ', password: 'password', rememberMe })
      await state.submit()
      expect(api.login).toHaveBeenCalledWith({
        username: 'user',
        password: 'password',
        expires: rememberMe ? -1 : 3600000,
        verifyCode: undefined,
        verifyKey: undefined,
        encryptId: undefined,
      })
      expect(api.login.mock.calls[0]?.[0]).not.toHaveProperty('rememberMe')
      expect(token.getRemembered()).toBe(rememberMe ? 'backend-token' : null)
      expect(localStorage.getItem('proto-bridge-ui:token')).toBe(
        rememberMe ? null : 'backend-token',
      )
      expect(state.form.password).toBe('')
      expect(router.currentRoute.value.path).toBe('/')
    },
  )

  it.each([
    ['/system/user', '/system/user'],
    ['//external.example/path', '/'],
    ['/login?redirect=/login', '/'],
  ])('validates a cookie-only session and redirects %s safely', async (redirect, expected) => {
    token.set('remembered', true)
    const { state, router } = await loginPage(redirect)
    expect(api.user).toHaveBeenCalledOnce()
    expect(api.authorization).toHaveBeenCalledOnce()
    expect(api.login).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe(expected)
    expect(state.error.value).toBe('')
  })

  it('retains visible network errors and the remembered cookie so retry can validate the session', async () => {
    token.set('remembered', true)
    api.user.mockRejectedValueOnce(new ApiError('Network unavailable'))
    const { state, router } = await loginPage()
    expect(state.error.value).toBe('Network unavailable')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(token.getRemembered()).toBe('remembered')
    await state.prepare()
    expect(state.error.value).toBe('')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('clears an invalid cookie and keeps authentication errors visible with a prepared login form', async () => {
    token.set('remembered', true)
    api.user.mockRejectedValueOnce(new ApiError('Session expired', 401))
    api.captchaConfig.mockResolvedValueOnce({ enabled: true })
    api.captcha.mockResolvedValueOnce({ key: 'captcha', base64: 'image' })
    const { state, router } = await loginPage()
    expect(state.error.value).toBe('Session expired')
    expect(state.loading.value).toBe(false)
    expect(state.captchaEnabled.value).toBe(true)
    expect(router.currentRoute.value.path).toBe('/login')
    expect(token.get()).toBeNull()
  })

  it.each(['new login', 'another tab'] as const)(
    'does not clear a newer credential when an old restore finishes after %s',
    async (replacement) => {
      let complete!: (profile: {
        id: string
        name: string
        username: string
        status: number
      }) => void
      let fail!: (cause: ApiError) => void
      api.user.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            complete = resolve
            fail = reject
          }),
      )
      token.set('old-remembered', true)
      const { wrapper, state } = await loginPage()
      if (replacement === 'new login') {
        wrapper.unmount()
        api.login.mockResolvedValueOnce({ token: 'new-remembered' })
        await useSession().login(
          { username: 'user', password: 'password', expires: -1 },
          { rememberMe: true },
        )
      } else {
        // Cookies are shared across tabs even though their in-memory session generations are not.
        token.set('new-remembered', true)
      }
      expect(token.getRemembered()).toBe('new-remembered')
      if (replacement === 'new login')
        complete({ id: 'old', name: 'Old User', username: 'old-user', status: 1 })
      else fail(new ApiError('Old session revoked', 401))
      await flushPromises()
      expect(state.error.value).not.toBe('')
      expect(token.getRemembered()).toBe('new-remembered')
    },
  )
})
