import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { sharesApi } from '@/modules/protohub-manager-ui/api'
import { shareCopyContent } from '@/modules/protohub-manager-ui/utils/share'
import type { Share } from '@/modules/protohub-manager-ui/types'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import { copyText } from '@/shared/utils/feedback'

export interface ShareCopyContext {
  projectId: string
  projectName: string
  versionId: string
  versionName: string
}

/** Keep plaintext passwords inside the current share dialog, never in persisted state or URLs. */
export function useShareCopy(
  context: Ref<ShareCopyContext | undefined>,
  url: (share: Share) => string,
) {
  const passwords = new Map<string, string>()
  const target = shallowRef<Share>()
  const enteredPassword = ref('')
  const verifiedPassword = ref<string>()
  const verified = ref(false)
  const busy = ref(false)
  const error = ref('')
  let generation = 0
  let controller: AbortController | undefined
  const key = (share: Share) => `${share.id}\0${share.token}`
  const matchesContext = (share: Share) =>
    context.value?.projectId === share.projectId && context.value?.versionId === share.versionId
  const format = (share: Share, password?: string) =>
    context.value
      ? shareCopyContent(
          context.value.projectName,
          context.value.versionName,
          url(share),
          t('proto.copyPasswordLabel'),
          password,
        )
      : ''
  const content = computed(() =>
    target.value && verified.value ? format(target.value, verifiedPassword.value) : '',
  )

  /** Invalidate an in-flight proof before a changed password, close, or different selected share. */
  function invalidate() {
    generation += 1
    controller?.abort()
    controller = undefined
    busy.value = false
    verified.value = false
    verifiedPassword.value = undefined
    error.value = ''
  }
  watch(enteredPassword, invalidate, { flush: 'sync' })
  function cancel() {
    invalidate()
    target.value = undefined
    enteredPassword.value = ''
  }
  function reset() {
    cancel()
    passwords.clear()
  }
  watch(() => `${context.value?.projectId || ''}\0${context.value?.versionId || ''}`, reset, {
    flush: 'sync',
  })
  onScopeDispose(reset)

  /** A creation response binds only its own password, even after the creation form is cleared. */
  function remember(share: Share, password: string) {
    if (matchesContext(share) && share.passwordRequired && password !== '')
      passwords.set(key(share), password)
  }
  function forget(id: string) {
    for (const shareKey of passwords.keys())
      if (shareKey.startsWith(`${id}\0`)) passwords.delete(shareKey)
    if (target.value?.id === id) cancel()
  }

  /** Known passwords copy immediately; old links require a separate proof and a new copy gesture. */
  async function copy(share: Share, event?: MouseEvent): Promise<boolean> {
    if (!matchesContext(share)) return false
    // A newer copy intent also invalidates any older clipboard failure or password proof.
    cancel()
    const password = share.passwordRequired ? passwords.get(key(share)) : undefined
    if (share.passwordRequired && password === undefined) {
      target.value = share
      return false
    }
    const copyGeneration = generation
    const element = event?.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
    // Invoke the shared copier before any await, preserving legacy HTTP browser user activation.
    const copied = await copyText(format(share, password), element)
    if (!copied && generation === copyGeneration && matchesContext(share)) {
      cancel()
      target.value = share
      verifiedPassword.value = password
      verified.value = true
    }
    return copied
  }

  /** Verification grants access to the preview text, but deliberately never writes the clipboard. */
  async function verify() {
    const share = target.value
    if (!share || !matchesContext(share) || busy.value) return
    if (!enteredPassword.value) {
      error.value = t('proto.passwordRequired')
      return
    }
    const rawPassword = enteredPassword.value
    const proofGeneration = generation
    const current = new AbortController()
    controller = current
    busy.value = true
    error.value = ''
    try {
      const passed = await sharesApi.verifyPassword(share.id, rawPassword, {
        signal: current.signal,
        silent: true,
      })
      if (proofGeneration !== generation || current.signal.aborted) return
      if (passed !== true) {
        error.value = t('proto.sharePasswordInvalid')
        return
      }
      remember(share, rawPassword)
      verifiedPassword.value = rawPassword
      verified.value = true
    } catch (cause) {
      if (proofGeneration === generation && !(cause instanceof ApiError && cause.cancelled))
        error.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (proofGeneration === generation) {
        busy.value = false
        controller = undefined
      }
    }
  }

  /** The explicit second click remains a browser user gesture even after asynchronous verification. */
  function copyVerified(event?: MouseEvent) {
    if (!target.value || !verified.value || !matchesContext(target.value))
      return Promise.resolve(false)
    const element = event?.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
    return copyText(content.value, element)
  }
  return {
    target,
    enteredPassword,
    verified,
    busy,
    error,
    content,
    copy,
    verify,
    copyVerified,
    cancel,
    remember,
    forget,
    reset,
  }
}
