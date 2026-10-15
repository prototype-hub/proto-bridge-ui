import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { request } from '@/shared/api/client'
import { i18n } from '@/shared/i18n'
import { accountLocales } from '@/modules/authentication-manager-ui/locales/account'
import { localeMessages } from '@/modules/authentication-manager-ui/locale-messages'
import PasswordChangeModal from '@/modules/authentication-manager-ui/views/account/components/PasswordChangeModal.vue'
import type { ApiResponse } from '@/shared/api/types'
vi.mock('@/shared/api/client', () => ({ request: { post: vi.fn(), put: vi.fn() } }))
const response = <T>(result: T) => ({ success: true, status: 200, result })
const wrappers: ReturnType<typeof mount>[] = []
function dialog() {
  return new DOMWrapper(document.body).get('.ant-modal')
}
async function submit() {
  await dialog().get('form').trigger('submit')
  await flushPromises()
}
function mountEditor() {
  const wrapper = mount(PasswordChangeModal, {
    props: { open: true },
    attachTo: document.body,
    global: { plugins: [i18n] },
  })
  wrappers.push(wrapper)
  return wrapper
}
beforeEach(() => {
  vi.mocked(request.post)
    .mockReset()
    .mockResolvedValue(response({ passed: true }))
  vi.mocked(request.put).mockReset().mockResolvedValue(response(true))
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', {
    ...localeMessages.zh,
    system: {
      ...localeMessages.zh.system,
      oldPassword: '旧密码',
      newPassword: '新密码',
      confirmPassword: '确认密码',
      passwordMismatch: '两次输入的密码不一致',
    },
  })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('three-step password dialog', () => {
  it('shows one labeled field at a time, blocks old failures and advances only after server validation', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    expect(dialog().findAll('input')).toHaveLength(1)
    expect(dialog().get('label').text()).toBe('旧密码')
    expect(dialog().get('label').attributes('for')).toBe(dialog().get('input').attributes('id'))
    await dialog().get('input').setValue('old')
    vi.mocked(request.post).mockResolvedValueOnce(response({ passed: false }))
    await submit()
    expect(dialog().text()).toContain(accountLocales.zh.accountPassword.oldInvalid)
    expect(dialog().get('label').text()).toBe('旧密码')
    await submit()
    expect(dialog().get('label').text()).toBe('新密码')
    await dialog().get('input').setValue('Newpassword123')
    await submit()
    expect(dialog().get('label').text()).toBe('确认密码')
    await dialog().get('input').setValue('wrong')
    await submit()
    expect(dialog().text()).toContain('两次输入的密码不一致')
    expect(request.put).not.toHaveBeenCalled()
    await dialog().get('input').setValue('Newpassword123')
    await submit()
    expect(request.put).toHaveBeenCalledWith(
      '/user/passwd',
      { oldPassword: 'old', newPassword: 'Newpassword123' },
      expect.objectContaining({ silent: true }),
    )
    expect(wrapper.emitted('completed')).toHaveLength(1)
  })
  it('disables pending controls and a closed/reopened draft ignores the previous validation error', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    let reject!: (reason: Error) => void
    vi.mocked(request.post).mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    await dialog().get('input').setValue('old')
    await dialog().get('form').trigger('submit')
    await flushPromises()
    expect(dialog().get('input').attributes('disabled')).toBeDefined()
    expect(dialog().get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    reject(new Error('Previous draft error'))
    await flushPromises()
    expect(dialog().text()).not.toContain('Previous draft error')
    expect(dialog().get('label').text()).toBe('旧密码')
    expect(dialog().get('input').element.value).toBe('')
    expect(wrapper.emitted('completed')).toBeUndefined()
  })
  it('keeps an authoritative password write open and single until it fails, then restores cancellation', async () => {
    const wrapper = mountEditor()
    await flushPromises()
    await dialog().get('input').setValue('old')
    await submit()
    await dialog().get('input').setValue('Newpassword123')
    await submit()
    await dialog().get('input').setValue('Newpassword123')
    let reject!: (reason: Error) => void
    vi.mocked(request.put).mockReturnValueOnce(
      new Promise<ApiResponse<unknown>>((_, fail) => {
        reject = fail
      }),
    )
    await submit()
    expect(dialog().get('input').attributes('disabled')).toBeDefined()
    expect(dialog().find('.ant-modal-close').exists()).toBe(false)
    const cancel = dialog()
      .findAll('button')
      .find((button) => button.text().replace(/\s/g, '') === '取消')!
    expect(cancel.attributes('disabled')).toBeDefined()
    await cancel.trigger('click')
    await dialog().get('form').trigger('submit')
    await flushPromises()
    expect(request.put).toHaveBeenCalledOnce()
    expect(wrapper.emitted('update:open')).toBeUndefined()
    await wrapper.setProps({ open: false })
    expect(dialog().get('input').element.value).toBe('Newpassword123')
    await wrapper.setProps({ open: true })
    reject(new Error('Authoritative update rejected'))
    await flushPromises()
    expect(dialog().text()).toContain('Authoritative update rejected')
    expect(dialog().get('input').attributes('disabled')).toBeUndefined()
    expect(dialog().find('.ant-modal-close').exists()).toBe(true)
    expect(wrapper.emitted('completed')).toBeUndefined()
    await dialog().get('.ant-modal-close').trigger('click')
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })
})
