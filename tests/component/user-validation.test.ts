import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import UserEditor from '@/modules/authentication-manager-ui/views/user/components/UserEditor.vue'
import type { UserInput } from '@/modules/authentication-manager-ui/types/user'
import { localeMessages } from '@/modules/authentication-manager-ui/locale-messages'
import { common } from '@/shared/i18n/common'
import { permissionKey } from '@/shared/auth/provider'

function editor(overrides: Partial<UserInput> = {}) {
  const model = reactive<UserInput>({
    name: 'Operator',
    username: 'operator',
    password: 'abcdefghijkl',
    confirmPassword: 'abcdefghijkl',
    roleIdList: ['r1'],
    ...overrides,
  })
  const locale = createI18n({
    legacy: false,
    locale: 'zh',
    messages: {
      zh: { ...localeMessages.zh, common: common.zh },
      en: { ...localeMessages.en, common: common.en },
    },
  })
  const wrapper = mount(UserEditor, {
    props: { model, roles: [{ id: 'r1', name: 'Operator role' }], context: {} },
    global: { plugins: [locale], provide: { [permissionKey as symbol]: { can: () => true } } },
  })
  return { model, wrapper }
}
beforeEach(() =>
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })),
)
afterEach(() => vi.unstubAllGlobals())

describe('user editor matches the active account contract', () => {
  it('submits a Chinese username, long name and international contacts with a non-complex password', async () => {
    const { wrapper } = editor({
      name: '名'.repeat(100),
      username: '中文用户',
      telephone: '+44 (0)20 1234 5678',
      email: `person@${'a'.repeat(45)}.${'b'.repeat(30)}.com`,
    })
    try {
      expect(wrapper.get('input[id$="name"]').attributes('maxlength')).toBe('128')
      expect(wrapper.get('input[id$="telephone"]').attributes('maxlength')).toBe('64')
      expect(wrapper.get('input[id$="email"]').attributes('maxlength')).toBe('255')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      await vi.waitFor(() => expect(wrapper.emitted('save')).toHaveLength(1))
    } finally {
      wrapper.unmount()
    }
  })

  it('blocks blank required fields, missing roles and short passwords with field-specific messages', async () => {
    const { model, wrapper } = editor({
      name: '   ',
      username: '   ',
      roleIdList: [],
      password: 'Abcdef12',
      confirmPassword: 'Abcdef12',
    })
    try {
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      for (const message of [
        '请输入姓名',
        '请输入用户名',
        '请至少选择一个角色',
        '密码须为 12 至 128 个字符，不能全部为空白',
      ])
        await vi.waitFor(() => expect(wrapper.text()).toContain(message))
      expect(wrapper.emitted('save')).toBeUndefined()
      Object.assign(model, {
        name: 'Operator',
        username: 'operator',
        roleIdList: ['r1'],
        password: 'abcdefghijkl',
        confirmPassword: 'different password',
      })
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      await vi.waitFor(() => expect(wrapper.text()).toContain('两次输入的密码不一致'))
      expect(wrapper.emitted('save')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('validates imported over-limit values and accepts exact limits or empty optional contacts without trimming passwords', async () => {
    const password = ` ${'a'.repeat(126)} `
    const { model, wrapper } = editor({
      name: 'n'.repeat(129),
      telephone: 't'.repeat(65),
      email: `${'e'.repeat(244)}@example.com`,
      password: 'p'.repeat(129),
      confirmPassword: 'p'.repeat(129),
    })
    try {
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      for (const message of [
        '姓名最多 128 个字符',
        '联系电话最多 64 个字符',
        '电子邮箱最多 255 个字符',
        '密码须为 12 至 128 个字符，不能全部为空白',
      ])
        await vi.waitFor(() => expect(wrapper.text()).toContain(message))
      expect(wrapper.emitted('save')).toBeUndefined()
      Object.assign(model, {
        name: 'n'.repeat(128),
        telephone: 't'.repeat(64),
        email: `${'e'.repeat(243)}@example.com`,
        password,
        confirmPassword: password,
      })
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      await vi.waitFor(() => expect(wrapper.emitted('save')).toHaveLength(1))
      model.telephone = ''
      model.email = ''
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      await vi.waitFor(() => expect(wrapper.emitted('save')).toHaveLength(2))
      expect(model.password).toBe(password)
      model.email = 'bad-email'
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      await vi.waitFor(() =>
        expect(wrapper.text()).toContain('请输入有效的电子邮箱，例如 name@example.com'),
      )
      await vi.waitFor(() => expect(wrapper.emitted('save')).toHaveLength(2))
    } finally {
      wrapper.unmount()
    }
  })
})
