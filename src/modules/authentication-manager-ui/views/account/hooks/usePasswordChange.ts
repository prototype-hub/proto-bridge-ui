import { onBeforeUnmount, ref } from 'vue'
import * as api from '@/modules/authentication-manager-ui/api/account/center'
import type {
  PasswordChangeDraft,
  PasswordChangeStep,
  PasswordValidation,
} from '@/modules/authentication-manager-ui/types/account'
import type { RequestOptions } from '@/shared/api/types'
import { t } from '@/shared/i18n'

const empty = (): PasswordChangeDraft => ({ oldPassword: '', newPassword: '', confirmPassword: '' })
export function usePasswordChange(completed: () => Promise<void> | void) {
  const step = ref<PasswordChangeStep>(0),
    draft = ref(empty()),
    busy = ref(false),
    writing = ref(false),
    error = ref('')
  let generation = 0,
    oldProof = '',
    newProof = '',
    active: AbortController | undefined
  function invalidate() {
    generation++
    active?.abort()
    active = undefined
    busy.value = false
    error.value = ''
  }
  function reset() {
    if (writing.value) return
    invalidate()
    oldProof = newProof = ''
    draft.value = empty()
    step.value = 0
  }
  function setOldPassword(value: string) {
    if (writing.value) return
    invalidate()
    oldProof = newProof = ''
    draft.value = { ...empty(), oldPassword: value }
    step.value = 0
  }
  function setNewPassword(value: string) {
    if (writing.value) return
    invalidate()
    newProof = ''
    draft.value.newPassword = value
    draft.value.confirmPassword = ''
  }
  function setConfirmation(value: string) {
    if (writing.value) return
    invalidate()
    draft.value.confirmPassword = value
  }
  function back() {
    if (busy.value) return
    invalidate()
    if (step.value === 2) {
      newProof = ''
      draft.value.confirmPassword = ''
      step.value = 1
    } else {
      oldProof = newProof = ''
      step.value = 0
    }
  }
  function validation(result: PasswordValidation, fallback: string) {
    if (result.passed !== true) throw new Error(result.reason || t(fallback))
  }
  function validNew(value: string) {
    return value.length >= 12 && value.length <= 128 && /\S/u.test(value)
  }
  async function run(action: (current: () => boolean, options: RequestOptions) => Promise<void>) {
    if (busy.value) return
    const version = generation,
      controller = new AbortController()
    active = controller
    busy.value = true
    error.value = ''
    const current = () => version === generation && !controller.signal.aborted
    try {
      await action(current, { signal: controller.signal, silent: true })
    } catch (cause) {
      // A closed or changed draft owns a new generation; old failures cannot overwrite its feedback.
      if (current()) error.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (current()) {
        writing.value = false
        busy.value = false
        active = undefined
      }
    }
  }
  async function next() {
    const expected = step.value,
      value = { ...draft.value }
    if (expected === 2) return
    await run(async (current, options) => {
      if (expected === 0) {
        if (!value.oldPassword) throw new Error(t('common.required'))
        const result = await api.checkOldPassword_api(value.oldPassword, options)
        if (!current()) return
        validation(result.result, 'accountPassword.oldInvalid')
        oldProof = value.oldPassword
        step.value = 1
      } else {
        if (oldProof !== value.oldPassword || !oldProof) {
          step.value = 0
          throw new Error(t('accountPassword.verifyOldFirst'))
        }
        if (!validNew(value.newPassword)) throw new Error(t('accountPassword.rule'))
        const result = await api.validateField_api('password', value.newPassword, options)
        if (!current()) return
        validation(result.result, 'accountPassword.rule')
        newProof = value.newPassword
        step.value = 2
      }
    })
  }
  async function submit() {
    if (step.value !== 2) return
    const value = { ...draft.value }
    await run(async (current, options) => {
      if (!oldProof || oldProof !== value.oldPassword) {
        step.value = 0
        throw new Error(t('accountPassword.verifyOldFirst'))
      }
      if (newProof !== value.newPassword || !validNew(value.newPassword)) {
        step.value = 1
        throw new Error(t('accountPassword.rule'))
      }
      if (value.newPassword !== value.confirmPassword) throw new Error(t('system.passwordMismatch'))
      // Earlier step validation is UI state only. Recheck before PUT, which also verifies old password.
      const old = await api.checkOldPassword_api(value.oldPassword, options)
      if (!current()) return
      if (old.result.passed !== true) {
        oldProof = newProof = ''
        step.value = 0
        validation(old.result, 'accountPassword.oldInvalid')
      }
      const newer = await api.validateField_api('password', value.newPassword, options)
      if (!current()) return
      if (newer.result.passed !== true) {
        newProof = ''
        step.value = 1
        validation(newer.result, 'accountPassword.rule')
      }
      // HTTP cancellation cannot undo a password write or token revocation. Keep this draft locked
      // until the authoritative response settles, including when the parent tries to close it.
      writing.value = true
      const result = await api.updateMepsd_api(
        { oldPassword: value.oldPassword, newPassword: value.newPassword },
        { silent: true },
      )
      if (!current()) return
      if (result.result !== true) throw new Error(t('accountPassword.saveFailed'))
      await completed()
      if (current()) {
        writing.value = false
        reset()
      }
    })
  }
  onBeforeUnmount(reset)
  return {
    step,
    draft,
    busy,
    writing,
    error,
    reset,
    setOldPassword,
    setNewPassword,
    setConfirmation,
    back,
    next,
    submit,
  }
}
