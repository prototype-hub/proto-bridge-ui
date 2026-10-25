import { computed, ref, shallowRef, reactive, watch, onScopeDispose, type Ref } from 'vue'
import { reviewApi, type ReviewGrant } from '@/modules/protohub-manager-ui/api/review'
import type {
  PublicShare,
  ReviewContext,
  ReviewChallenge,
} from '@/modules/protohub-manager-ui/types'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'

/** Keep mailbox identity in the trusted shell; never copy its cookie or CSRF into the workspace. */
export function useReviewIdentity(share: Ref<PublicShare | undefined>, open: Ref<boolean>) {
  const context = shallowRef<ReviewContext>()
  const challenge = shallowRef<ReviewChallenge>()
  const form = reactive({ email: '', displayName: '', company: '', code: '' })
  const loading = ref(false),
    busy = ref(false),
    error = ref(''),
    expired = ref(false)
  const now = ref(Date.now())
  let controller: AbortController | undefined
  let clock: ReturnType<typeof setInterval> | undefined
  let generation = 0
  const grant = computed<ReviewGrant | undefined>(() => {
    const value = share.value
    return open.value && value?.reviewEnabled && value.accessKey && value.revisionId
      ? { token: value.token, revisionId: value.revisionId, accessKey: value.accessKey }
      : undefined
  })
  const canSend = computed(
    () =>
      !!context.value?.mailAvailable &&
      !busy.value &&
      !loading.value &&
      now.value >= (challenge.value?.resendAfter || 0),
  )
  const canVerify = computed(
    () =>
      !!challenge.value && now.value < challenge.value.expiresAt && !busy.value && !!context.value,
  )
  function clear() {
    generation++
    controller?.abort()
    clearInterval(clock)
    context.value = challenge.value = undefined
    loading.value = busy.value = false
    expired.value = false
    error.value = ''
    Object.assign(form, { email: '', displayName: '', company: '', code: '' })
  }
  function message(cause: unknown) {
    if (cause instanceof ApiError) {
      if (cause.status === 429) return t('proto.reviewRateLimited')
      if (cause.code === 'PROTOTYPE_HUB_REVIEW_CODE_INVALID') return t('proto.reviewCodeInvalid')
      if (cause.code === 'PROTOTYPE_HUB_REVIEW_ORIGIN_DENIED') return t('proto.reviewOriginDenied')
      if (cause.code === 'PROTOTYPE_HUB_REVIEW_COOKIE_REQUIRED')
        return t('proto.reviewCookieRequired')
      if (cause.code === 'PROTOTYPE_HUB_REVIEW_CSRF_INVALID') return t('proto.reviewCsrfChanged')
      if (cause.status === 403 || cause.status === 404) return t('proto.reviewAccessChanged')
      if (cause.status === 503) return t('proto.reviewMailUnavailable')
    }
    return t('proto.reviewUnavailable')
  }
  function accept(result: ReviewContext, selected: ReviewGrant) {
    if (result.revisionId !== selected.revisionId || !result.enabled || !result.csrfToken)
      throw new ApiError(t('proto.reviewAccessChanged'), 403)
    context.value = result
    expired.value = false
  }
  async function run(
    action: (selected: ReviewGrant, signal: AbortSignal) => Promise<void>,
    initial = false,
  ) {
    const selected = grant.value
    if (!selected || busy.value || loading.value) return
    const epoch = generation
    const request = new AbortController()
    controller?.abort()
    controller = request
    if (initial) loading.value = true
    else busy.value = true
    error.value = ''
    try {
      await action(selected, request.signal)
    } catch (cause) {
      if (epoch !== generation || request.signal.aborted) return
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        context.value = challenge.value = undefined
      }
      error.value = message(cause)
    } finally {
      if (epoch === generation) loading.value = busy.value = false
    }
  }
  async function load() {
    context.value = challenge.value = undefined
    await run(async (selected, signal) => {
      const result = await reviewApi.context(selected, signal)
      if (!signal.aborted) accept(result, selected)
    }, true)
  }
  async function send() {
    if (!canSend.value || !context.value) return
    const profile = {
      email: form.email.trim(),
      displayName: form.displayName.trim(),
      company: form.company.trim() || undefined,
    }
    if (
      !profile.email ||
      !profile.displayName ||
      profile.email.length > 254 ||
      profile.displayName.length > 100 ||
      (profile.company?.length || 0) > 200
    ) {
      error.value = t('proto.reviewProfileRequired')
      return
    }
    const csrf = context.value.csrfToken
    // Clear any previous challenge before an ambiguous send; a retry is always explicit.
    challenge.value = undefined
    form.code = ''
    await run(async (selected, signal) => {
      const result = await reviewApi.challenge(selected, profile, csrf, signal)
      if (!signal.aborted) challenge.value = result
    })
  }
  async function verify() {
    if (!canVerify.value || !challenge.value || !context.value) return
    if (!/^[0-9]{6}$/.test(form.code)) {
      error.value = t('proto.reviewCodeRequired')
      return
    }
    const id = challenge.value.challengeId,
      code = form.code,
      csrf = context.value.csrfToken
    await run(async (selected, signal) => {
      const result = await reviewApi.verify(selected, id, code, csrf, signal)
      if (signal.aborted) return
      accept(result, selected)
      if (!result.session) throw new ApiError(t('proto.reviewCodeInvalid'))
      challenge.value = undefined
      Object.assign(form, { email: '', displayName: '', company: '', code: '' })
    })
  }
  async function logout() {
    if (!context.value?.session) return
    const csrf = context.value.csrfToken
    await run(async (selected, signal) => {
      await reviewApi.logout(selected, csrf, signal)
      if (signal.aborted) return
      context.value = challenge.value = undefined
      const result = await reviewApi.context(selected, signal)
      if (!signal.aborted) accept(result, selected)
    })
  }
  watch(
    () => [form.email, form.displayName, form.company],
    () => {
      challenge.value = undefined
      form.code = ''
    },
    { flush: 'sync' },
  )
  watch(
    () => [
      open.value,
      share.value?.token,
      share.value?.revisionId,
      share.value?.accessKey,
      share.value?.reviewEnabled,
    ],
    () => {
      clear()
      if (!grant.value) return
      now.value = Date.now()
      clock = setInterval(() => {
        now.value = Date.now()
        if (context.value?.session && context.value.session.expiresAt <= now.value) {
          context.value = challenge.value = undefined
          expired.value = true
        }
      }, 1000)
      void load()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(clear)
  return {
    context,
    challenge,
    form,
    loading,
    busy,
    error,
    expired,
    now,
    canSend,
    canVerify,
    load,
    send,
    verify,
    logout,
  }
}
