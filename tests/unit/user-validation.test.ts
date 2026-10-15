import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { usersApi } from '@/modules/authentication-manager-ui/api/user/users'
import { useUsers } from '@/modules/authentication-manager-ui/views/user/hooks/useUsers'
import { i18n } from '@/shared/i18n'
import { localeMessages } from '@/modules/authentication-manager-ui/locale-messages'

vi.mock('@/modules/authentication-manager-ui/api/user/users', () => ({
  usersApi: { list: vi.fn(), get: vi.fn(), save: vi.fn(), validate: vi.fn(), password: vi.fn() },
}))
vi.mock('@/modules/authentication-manager-ui/api/role/roles', () => ({
  rolesApi: { all: vi.fn(async () => []) },
}))
vi.mock('@/modules/authentication-manager-ui/api/role/role-options', () => ({
  roleIdentityApi: { roleOptions: vi.fn(async () => []) },
}))
vi.mock('@/modules/authentication-manager-ui/api/user/user-types', () => ({
  userIdentityApi: { userTypes: vi.fn(async () => []) },
}))
vi.mock('@/modules/authentication-manager-ui/api/position/position-options', () => ({
  positionIdentityApi: { positions: vi.fn(async () => []) },
}))
vi.mock('@/modules/authentication-manager-ui/hooks/form-options', () => ({
  formOptions: vi.fn(async () => ({})),
}))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn(), deleted: vi.fn() }))
const wrappers: ReturnType<typeof mount>[] = []
async function users() {
  let state!: ReturnType<typeof useUsers>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useUsers()
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)
  await flushPromises()
  state.form.value = {
    name: 'Operator',
    username: '中文用户',
    password: 'abcdefghijkl',
    confirmPassword: 'abcdefghijkl',
    roleIdList: ['r1'],
  }
  return state
}
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', localeMessages.zh)
  vi.mocked(usersApi.list).mockResolvedValue({ data: [], total: 0, pageIndex: 0, pageSize: 20 })
  vi.mocked(usersApi.validate).mockResolvedValue({ passed: true })
  vi.mocked(usersApi.save).mockResolvedValue({ success: true, status: 200, result: true })
  vi.mocked(usersApi.password).mockResolvedValue({ success: true, status: 200, result: true })
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})

describe('account validation feedback and preflight', () => {
  it('blocks short passwords and mismatching confirmation before remote checks, then creates with passed-only results', async () => {
    const state = await users()
    state.form.value.password = state.form.value.confirmPassword = 'Abcdef12'
    await state.save()
    expect(state.task.error.value).toBe('密码须为 12 至 128 个字符，不能全部为空白')
    expect(usersApi.validate).not.toHaveBeenCalled()
    state.form.value.password = 'abcdefghijkl'
    state.form.value.confirmPassword = 'different password'
    await state.save()
    expect(state.task.error.value).toBe('两次输入的密码不一致')
    expect(usersApi.validate).not.toHaveBeenCalled()
    expect(usersApi.save).not.toHaveBeenCalled()
    state.form.value.confirmPassword = state.form.value.password
    await state.save()
    expect(usersApi.validate).toHaveBeenNthCalledWith(1, 'username', '中文用户')
    expect(usersApi.validate).toHaveBeenNthCalledWith(2, 'password', 'abcdefghijkl')
    expect(usersApi.save).toHaveBeenCalledWith(state.form.value)
    expect(state.task.error.value).toBe('')
  })

  it('shows the rejected field when no reason is returned and preserves explicit server reasons', async () => {
    const state = await users()
    vi.mocked(usersApi.validate).mockResolvedValueOnce({ passed: false })
    await state.save()
    expect(state.task.error.value).toBe('用户名已存在或不可用，请更换用户名')
    expect(usersApi.save).not.toHaveBeenCalled()
    vi.mocked(usersApi.validate)
      .mockResolvedValueOnce({ passed: true })
      .mockResolvedValueOnce({ passed: false })
    await state.save()
    expect(state.task.error.value).toBe('密码须为 12 至 128 个字符，不能全部为空白')
    vi.mocked(usersApi.validate).mockResolvedValueOnce({
      passed: false,
      reason: 'This username is reserved by the server',
    })
    await state.save()
    expect(state.task.error.value).toBe('This username is reserved by the server')
    expect(usersApi.save).not.toHaveBeenCalled()
  })

  it('uses the same password limits for reset and sends mixed whitespace verbatim', async () => {
    const state = await users(),
      password = ` ${'a'.repeat(126)} `
    state.resetId.value = 'u1'
    state.password.value = state.confirmPassword.value = ' '.repeat(12)
    await state.reset()
    expect(usersApi.password).not.toHaveBeenCalled()
    state.password.value = state.confirmPassword.value = password
    vi.mocked(usersApi.validate).mockResolvedValueOnce({
      passed: false,
      reason: 'Server password rejection',
    })
    await state.reset()
    expect(state.task.error.value).toBe('Server password rejection')
    expect(usersApi.password).not.toHaveBeenCalled()
    await state.reset()
    expect(usersApi.validate).toHaveBeenLastCalledWith('password', password)
    expect(usersApi.password).toHaveBeenCalledWith('u1', password)
    expect(state.resetId.value).toBe('')
  })
})
