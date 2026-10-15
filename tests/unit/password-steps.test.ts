import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { request } from '@/shared/api/client'
import { i18n } from '@/shared/i18n'
import { accountLocales } from '@/modules/authentication-manager-ui/locales/account'
import { usePasswordChange } from '@/modules/authentication-manager-ui/views/account/hooks/usePasswordChange'
import type { ApiResponse } from '@/shared/api/types'
import type { PasswordValidation } from '@/modules/authentication-manager-ui/types/account'

vi.mock('@/shared/api/client', () => ({ request: { post: vi.fn(), put: vi.fn() } }))
const response = <T>(result: T): ApiResponse<T> => ({ success: true, status: 200, result })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
const mounted: ReturnType<typeof mount>[] = []
function setup() {
  let state!: ReturnType<typeof usePasswordChange>
  const completed = vi.fn()
  const harness = defineComponent({
    setup() {
      state = usePasswordChange(completed)
      return () => h('div')
    },
  })
  const wrapper = mount(harness)
  mounted.push(wrapper)
  return { state, completed, wrapper }
}
async function confirmStep(state: ReturnType<typeof usePasswordChange>) {
  state.setOldPassword('old')
  await state.next()
  state.setNewPassword(' NewPassword123 ')
  await state.next()
  state.setConfirmation(' NewPassword123 ')
}
beforeEach(() => {
  vi.mocked(request.post)
    .mockReset()
    .mockResolvedValue(response({ passed: true }))
  vi.mocked(request.put).mockReset().mockResolvedValue(response(true))
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', {
    ...accountLocales.zh,
    system: { passwordMismatch: '两次输入的密码不一致' },
  })
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

describe('password step boundaries', () => {
  it('blocks step two on failed or ambiguous old-password validation without imposing a new-password policy', async () => {
    const { state } = setup()
    state.setOldPassword(' old ')
    vi.mocked(request.post).mockResolvedValueOnce(response({ passed: false }))
    await state.next()
    expect(state.step.value).toBe(0)
    expect(state.error.value).toBe(accountLocales.zh.accountPassword.oldInvalid)
    expect(request.post).toHaveBeenLastCalledWith(
      '/user/me/password/_validate',
      ' old ',
      expect.objectContaining({ headers: { 'Content-Type': 'text/plain' } }),
    )
    vi.mocked(request.post).mockResolvedValueOnce(response({}))
    await state.next()
    expect(state.step.value).toBe(0)
    await state.next()
    expect(state.step.value).toBe(1)
    expect(request.put).not.toHaveBeenCalled()
  })

  it('checks new 12..128 raw characters before confirmation and submits only the two password fields', async () => {
    const { state, completed } = setup()
    state.setOldPassword('old')
    await state.next()
    for (const invalid of ['x'.repeat(11), 'x'.repeat(129), ' '.repeat(12)]) {
      state.setNewPassword(invalid)
      await state.next()
      expect(state.step.value).toBe(1)
    }
    expect(request.post).toHaveBeenCalledTimes(1)
    const next = ' ' + 'x'.repeat(126) + ' '
    state.setNewPassword(next)
    await state.next()
    expect(state.step.value).toBe(2)
    state.setConfirmation(next)
    await state.submit()
    expect(request.put).toHaveBeenCalledWith(
      '/user/passwd',
      { oldPassword: 'old', newPassword: next },
      expect.objectContaining({ silent: true }),
    )
    expect(completed).toHaveBeenCalledOnce()
    expect(state.draft.value).toEqual({ oldPassword: '', newPassword: '', confirmPassword: '' })
  })

  it('invalidates prior old proof when returning and requires a fresh server validation', async () => {
    const { state } = setup()
    await confirmStep(state)
    state.back()
    state.back()
    expect(state.step.value).toBe(0)
    vi.mocked(request.post).mockResolvedValueOnce(
      response({ passed: false, reason: 'Changed server password' }),
    )
    await state.next()
    expect(state.error.value).toBe('Changed server password')
    expect(state.step.value).toBe(0)
    await state.submit()
    expect(request.put).not.toHaveBeenCalled()
  })

  it('ignores old validation success and rejection after a changed draft, close or unmount', async () => {
    const { state, wrapper } = setup()
    const old = deferred<ApiResponse<PasswordValidation>>()
    vi.mocked(request.post).mockReturnValueOnce(old.promise)
    state.setOldPassword('first')
    const checking = state.next()
    state.setOldPassword('second')
    await state.next()
    expect(state.step.value).toBe(1)
    old.resolve(response({ passed: true }))
    await checking
    expect(state.draft.value.oldPassword).toBe('second')
    state.reset()
    const failed = deferred<ApiResponse<PasswordValidation>>()
    vi.mocked(request.post).mockReturnValueOnce(failed.promise)
    state.setOldPassword('third')
    const closing = state.next()
    state.reset()
    failed.reject(new Error('Late old password error'))
    await closing
    expect(state.error.value).toBe('')
    const leaving = deferred<ApiResponse<PasswordValidation>>()
    vi.mocked(request.post).mockReturnValueOnce(leaving.promise)
    state.setOldPassword('fourth')
    const pending = state.next()
    wrapper.unmount()
    leaving.resolve(response({ passed: true }))
    await pending
    expect(state.step.value).toBe(0)
  })

  it('rejects mismatches, final old/password failures and update errors without completing', async () => {
    const { state, completed } = setup()
    await confirmStep(state)
    state.setConfirmation('different')
    await state.submit()
    expect(state.error.value).toBe('两次输入的密码不一致')
    expect(request.put).not.toHaveBeenCalled()
    state.setConfirmation(' NewPassword123 ')
    vi.mocked(request.post).mockResolvedValueOnce(response({ passed: false }))
    await state.submit()
    expect(state.step.value).toBe(0)
    expect(request.put).not.toHaveBeenCalled()
    await state.next()
    await state.next()
    state.setConfirmation(' NewPassword123 ')
    vi.mocked(request.put).mockRejectedValueOnce(new Error('Final update rejected'))
    await state.submit()
    expect(state.error.value).toBe('Final update rejected')
    expect(completed).not.toHaveBeenCalled()
    expect(state.step.value).toBe(2)
  })

  it('allows only one validation or final update at a time and cannot discard an authoritative write', async () => {
    const { state, completed } = setup()
    const pending = deferred<ApiResponse<PasswordValidation>>()
    vi.mocked(request.post).mockReturnValueOnce(pending.promise)
    state.setOldPassword('old')
    const checking = state.next()
    await state.next()
    expect(request.post).toHaveBeenCalledOnce()
    pending.resolve(response({ passed: true }))
    await checking
    state.setNewPassword(' NewPassword123 ')
    await state.next()
    state.setConfirmation(' NewPassword123 ')
    const updating = deferred<ApiResponse<boolean>>()
    vi.mocked(request.put).mockReturnValueOnce(updating.promise)
    const first = state.submit()
    await vi.waitFor(() => expect(request.put).toHaveBeenCalledOnce())
    await state.submit()
    expect(request.put).toHaveBeenCalledOnce()
    expect(state.writing.value).toBe(true)
    state.reset()
    state.setOldPassword('replacement')
    state.setNewPassword('replacement')
    state.setConfirmation('replacement')
    expect(state.step.value).toBe(2)
    expect(state.draft.value).toEqual({
      oldPassword: 'old',
      newPassword: ' NewPassword123 ',
      confirmPassword: ' NewPassword123 ',
    })
    expect(vi.mocked(request.put).mock.calls[0]?.[2]?.signal).toBeUndefined()
    updating.resolve(response(true))
    await first
    expect(completed).toHaveBeenCalledOnce()
    expect(state.writing.value).toBe(false)
  })

  it('a cancelled validation settling late cannot release a newer authoritative write lock', async () => {
    for (const outcome of ['resolve', 'reject'] as const) {
      const { state, completed } = setup()
      const previous = deferred<ApiResponse<PasswordValidation>>()
      vi.mocked(request.post).mockReturnValueOnce(previous.promise)
      state.setOldPassword('previous draft')
      const oldChecking = state.next()
      state.reset()
      await confirmStep(state)
      const updating = deferred<ApiResponse<boolean>>()
      vi.mocked(request.put).mockReturnValueOnce(updating.promise)
      const writesBefore = vi.mocked(request.put).mock.calls.length
      const saving = state.submit()
      await vi.waitFor(() => expect(request.put).toHaveBeenCalledTimes(writesBefore + 1))
      expect(state.writing.value).toBe(true)
      if (outcome === 'resolve') previous.resolve(response({ passed: true }))
      else previous.reject(new Error('Previous draft rejected'))
      await oldChecking
      expect(state.writing.value).toBe(true)
      expect(state.busy.value).toBe(true)
      expect(state.error.value).toBe('')
      state.reset()
      state.setOldPassword('replacement draft')
      state.back()
      expect(state.step.value).toBe(2)
      expect(state.draft.value.oldPassword).toBe('old')
      await state.submit()
      expect(request.put).toHaveBeenCalledTimes(writesBefore + 1)
      updating.resolve(response(true))
      await saving
      expect(completed).toHaveBeenCalledOnce()
      expect(state.writing.value).toBe(false)
      expect(state.draft.value).toEqual({ oldPassword: '', newPassword: '', confirmPassword: '' })
    }
  })
})
