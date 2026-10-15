import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { User } from '@/shared/auth/types'
import { request } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { useSession } from '@/app/stores/session'
import { layoutLocales } from '@/app/locales'
import { systemLocales } from '@/modules/authentication-manager-ui/locale-messages'
import { organizationZh } from '@/modules/authentication-manager-ui/locale-messages'
import { useAccount } from '@/modules/authentication-manager-ui/views/account/hooks/useAccount'
import AccountView from '@/modules/authentication-manager-ui/views/account/index.vue'
import { slimmingZh } from '@/modules/authentication-manager-ui/locale-messages'

vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), put: vi.fn(), cancelAll: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn() }))

const profile = {
  id: 'u1',
  username: 'operator',
  name: 'Operator',
  avatar: '/avatar.png',
  telephone: '13800138000',
  email: 'operator@example.com',
  status: 1,
  roleList: [{ id: 'r1', name: 'Role one' }],
  orgList: [{ id: 'o1', name: 'Organization one' }],
  positions: [{ id: 'p1', name: 'Position one' }],
}
const response = <T>(result: T) => ({ success: true, status: 200, result })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}
async function mountAccount(page = false) {
  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/account/center', component: { render: () => h('div') } },
      { path: '/login', component: { render: () => h('div') } },
    ],
  })
  await router.push('/account/center')
  const session = useSession(pinia)
  session.user = { ...profile }
  let state!: ReturnType<typeof useAccount>
  const harness = defineComponent({
    setup() {
      state = useAccount()
      return () => h('div')
    },
  })
  const wrapper = mount(page ? AccountView : harness, {
    attachTo: document.body,
    global: { plugins: [pinia, router, i18n] },
  })
  await flushPromises()
  return { wrapper, state, session, router }
}

beforeEach(() => {
  vi.mocked(request.get).mockReset()
  vi.mocked(request.post).mockReset()
  vi.mocked(request.put).mockReset()
  vi.mocked(request.get).mockImplementation(async (path) => {
    if (path === '/user/settings/view/user') throw new ApiError('资源不存在', 404)
    if (path === '/user/detail') return response({ ...profile })
    throw new Error(`Unexpected profile request: ${path}`)
  })
  vi.mocked(request.post).mockResolvedValue(response({ passed: true }))
  vi.mocked(request.put).mockResolvedValue(response(true))
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', {
    system: systemLocales.zh,
    layout: layoutLocales.zh,
    organization: organizationZh,
    slimming: slimmingZh,
  })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('personal profile', () => {
  it('renders profile and its two actions without tabs or optional requests when default view is absent', async () => {
    const { wrapper } = await mountAccount(true)
    try {
      expect(wrapper.findAll('[role="tab"]')).toHaveLength(0)
      expect(wrapper.find('.ant-descriptions').text()).toContain('operator')
      expect(wrapper.text()).toContain('Role one')
      expect(wrapper.text()).toContain('Organization one')
      expect(wrapper.text()).toContain('Position one')
      expect(wrapper.findAll('button').map((button) => button.text().replace(/\s/g, ''))).toEqual([
        '编辑',
        '修改密码',
      ])
      expect(request.get).toHaveBeenCalledTimes(1)
      expect(request.get).toHaveBeenCalledWith('/user/detail', undefined, { silent: true })
      expect(request.post).not.toHaveBeenCalled()
      expect(wrapper.text()).not.toContain('资源不存在')
    } finally {
      wrapper.unmount()
    }
  })

  it('shows mandatory profile errors for retry and ignores late loads after a newer response or unmount', async () => {
    vi.mocked(request.get).mockRejectedValueOnce(new Error('Profile unavailable'))
    const { wrapper, state } = await mountAccount()
    try {
      expect(state.resource.error.value).toBe('Profile unavailable')
      await state.resource.load()
      expect(state.resource.error.value).toBe('')
      expect(state.profile.value.name).toBe('Operator')
      const older = deferred<ReturnType<typeof response<User>>>()
      const latest = deferred<ReturnType<typeof response<User>>>()
      vi.mocked(request.get).mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
      const first = state.resource.load()
      const second = state.resource.load()
      latest.resolve(response({ ...profile, name: 'Latest' }))
      await second
      older.resolve(response({ ...profile, name: 'Older' }))
      await first
      expect(state.profile.value.name).toBe('Latest')
      const pending = deferred<ReturnType<typeof response<User>>>()
      vi.mocked(request.get).mockReturnValueOnce(pending.promise)
      const leaving = state.resource.load()
      wrapper.unmount()
      pending.resolve(response({ ...profile, name: 'After leaving' }))
      await leaving
      expect(state.profile.value.name).toBe('Latest')
    } finally {
      wrapper.unmount()
    }
  })

  it('saves only editable personal details and refreshes the session without unrelated profile fields', async () => {
    const { wrapper, state, session } = await mountAccount()
    try {
      state.editing.value = { ...profile }
      vi.mocked(request.get).mockResolvedValueOnce(response({ ...profile, name: 'Updated' }))
      await state.save({ ...profile, name: 'Updated', __editing: true })
      expect(request.put).toHaveBeenCalledWith('/user/detail', {
        name: 'Updated',
        avatar: '/avatar.png',
        telephone: '13800138000',
        email: 'operator@example.com',
      })
      expect(state.editing.value).toBeUndefined()
      expect(session.user?.name).toBe('Updated')
      vi.mocked(request.put).mockRejectedValueOnce(new Error('Update rejected'))
      state.editing.value = { ...profile }
      await state.save({ name: 'Invalid' })
      expect(state.task.error.value).toBe('Update rejected')
      expect(state.editing.value).toBeDefined()
      expect(session.user?.name).toBe('Updated')
    } finally {
      wrapper.unmount()
    }
  })

  it('ends the account session only after the password workflow reports a successful final update', async () => {
    const { wrapper, state, session, router } = await mountAccount()
    try {
      state.changing.value = {}
      expect(session.user).toBeDefined()
      await state.passwordChanged()
      expect(state.changing.value).toBeUndefined()
      expect(session.user).toBeUndefined()
      expect(router.currentRoute.value.path).toBe('/login')
      expect(request.put).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
    }
  })

  it('opens the real personal editor and keeps account associations out of editable controls', async () => {
    const { wrapper } = await mountAccount(true)
    try {
      await wrapper.findAll('button')[0].trigger('click')
      await flushPromises()
      const modal = new DOMWrapper(document.body).get('.ant-modal')
      expect(modal.findAll('.ant-form-item')[0].text()).toContain('头像')
      expect(modal.find('.avatar-current img').attributes('src')).toBe('/avatar.png')
      expect(modal.find('.avatar-editor input[type="text"]').exists()).toBe(false)
      expect(modal.text()).toContain('联系电话')
      expect(modal.text()).not.toContain('Role one')
      const name = modal
        .findAll('.ant-form-item')
        .find((item) => item.get('label').text() === '名称')!
      await name.get('input').setValue('Edited in dialog')
      const save = modal.get('button[type="submit"]')
      await save.trigger('submit')
      await flushPromises()
      expect(request.put).toHaveBeenCalledWith(
        '/user/detail',
        expect.objectContaining({ name: 'Edited in dialog' }),
      )
    } finally {
      wrapper.unmount()
    }
  })
})
