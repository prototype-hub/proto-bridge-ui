import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useReviewIdentity } from '@/modules/protohub-manager-ui/views/share/hooks/useReviewIdentity'
import { reviewApi } from '@/modules/protohub-manager-ui/api/review'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import type { PublicShare, ReviewContext } from '@/modules/protohub-manager-ui/types'
vi.mock('@/modules/protohub-manager-ui/api/review', () => ({
  reviewApi: { context: vi.fn(), challenge: vi.fn(), verify: vi.fn(), logout: vi.fn() },
}))
let scope: EffectScope
const share = (): PublicShare => ({
  token: 'open',
  revisionId: 'r1',
  accessKey: 'grant',
  revisionMode: 'fixed',
  projectName: 'P',
  versionName: 'V',
  passwordRequired: false,
  reviewEnabled: true,
  reviewAvailable: true,
})
const context = (authenticated = false): ReviewContext => ({
  revisionId: 'r1',
  enabled: true,
  mailAvailable: true,
  csrfToken: authenticated ? 'rotated-csrf' : 'csrf',
  session: authenticated
    ? {
        guestId: 'guest',
        displayName: 'Visitor',
        company: null,
        maskedEmail: 'v***@example.invalid',
        verificationLevel: 'email',
        expiresAt: Date.now() + 8 * 3600000,
      }
    : null,
})
function setup(open = true, selected = share()) {
  const current = ref<PublicShare | undefined>(selected),
    visible = ref(open)
  return { state: scope.run(() => useReviewIdentity(current, visible))!, current, visible }
}
beforeEach(() => {
  vi.clearAllMocks()
  scope = effectScope()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  vi.mocked(reviewApi.context).mockResolvedValue(context())
  vi.mocked(reviewApi.challenge).mockResolvedValue({
    challengeId: 'challenge',
    expiresAt: Date.now() + 300000,
    resendAfter: Date.now() + 60000,
  })
  vi.mocked(reviewApi.verify).mockResolvedValue(context(true))
  vi.mocked(reviewApi.logout).mockResolvedValue({ loggedOut: true })
})
afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})
async function requested() {
  const result = setup()
  await flushPromises()
  Object.assign(result.state.form, {
    email: 'visitor@example.invalid',
    displayName: 'Visitor',
    company: 'Example',
  })
  await result.state.send()
  return result
}
it('uses a CSRF challenge, explicitly verifies, rotates state and clears profile after success', async () => {
  const { state } = await requested()
  expect(reviewApi.challenge).toHaveBeenCalledWith(
    { token: 'open', revisionId: 'r1', accessKey: 'grant' },
    { email: 'visitor@example.invalid', displayName: 'Visitor', company: 'Example' },
    'csrf',
    expect.any(AbortSignal),
  )
  expect(state.canSend.value).toBe(false)
  state.form.code = '123456'
  await state.verify()
  expect(state.context.value?.csrfToken).toBe('rotated-csrf')
  expect(state.context.value?.session?.verificationLevel).toBe('email')
  expect(state.form).toEqual({ email: '', displayName: '', company: '', code: '' })
  expect(state.challenge.value).toBeUndefined()
  await state.logout()
  expect(reviewApi.logout).toHaveBeenCalledWith(
    expect.any(Object),
    'rotated-csrf',
    expect.any(AbortSignal),
  )
  expect(state.context.value?.session).toBeNull()
  expect(reviewApi.context).toHaveBeenCalledTimes(2)
})
it.each([false, undefined])(
  'does not bootstrap without an explicitly enabled share (%s)',
  async (enabled) => {
    setup(true, { ...share(), reviewEnabled: enabled })
    await flushPromises()
    expect(reviewApi.context).not.toHaveBeenCalled()
  },
)
it('does not bootstrap an ungranted password page', async () => {
  setup(true, { ...share(), accessKey: undefined })
  await flushPromises()
  expect(reviewApi.context).not.toHaveBeenCalled()
})
it.each(['close', 'token', 'revision', 'grant', 'unmount'])(
  'aborts and ignores a late context on %s',
  async (action) => {
    let resolve!: (value: ReviewContext) => void
    vi.mocked(reviewApi.context).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const { state, visible, current } = setup()
    const signal = vi.mocked(reviewApi.context).mock.calls[0]![1]!
    if (action === 'close') visible.value = false
    if (action === 'token') current.value = { ...share(), token: 'other' }
    if (action === 'revision') {
      vi.mocked(reviewApi.context).mockResolvedValueOnce({ ...context(), revisionId: 'r2' })
      current.value = { ...share(), revisionId: 'r2' }
    }
    if (action === 'grant') current.value = { ...share(), accessKey: 'other' }
    if (action === 'unmount') scope.stop()
    expect(signal.aborted).toBe(true)
    resolve(context(true))
    await flushPromises()
    expect(state.context.value?.session).not.toBeTruthy()
  },
)
it('retains form input on invalid code and never silently resends', async () => {
  const { state } = await requested()
  state.form.code = '111111'
  vi.mocked(reviewApi.verify).mockRejectedValueOnce(
    new ApiError('hidden PII', 400, 'PROTOTYPE_HUB_REVIEW_CODE_INVALID'),
  )
  await state.verify()
  expect(state.error.value).toBe(protoLocales.zh.reviewCodeInvalid)
  expect(state.form.email).toBe('visitor@example.invalid')
  expect(state.context.value?.session).toBeNull()
  expect(reviewApi.challenge).toHaveBeenCalledOnce()
})
it('blocks malformed codes and resets the challenge when the profile changes', async () => {
  const { state } = await requested()
  state.form.code = '１２３４５６'
  await state.verify()
  expect(reviewApi.verify).not.toHaveBeenCalled()
  expect(state.error.value).toBe(protoLocales.zh.reviewCodeRequired)
  state.form.email = 'changed@example.invalid'
  expect(state.challenge.value).toBeUndefined()
  expect(state.form.code).toBe('')
})
it('shows configured mail unavailability and cannot send', async () => {
  vi.mocked(reviewApi.context).mockResolvedValueOnce({ ...context(), mailAvailable: false })
  const { state } = setup()
  await flushPromises()
  await state.send()
  expect(state.canSend.value).toBe(false)
  expect(reviewApi.challenge).not.toHaveBeenCalled()
})
it.each([429, 503, 403])(
  'localizes %s without exposing server PII or keeping unauthorized identity',
  async (status) => {
    const { state } = await requested()
    state.form.code = '123456'
    vi.mocked(reviewApi.verify).mockRejectedValueOnce(new ApiError('secret recipient/code', status))
    await state.verify()
    expect(state.error.value).not.toContain('secret')
    expect(state.context.value?.session).not.toBeTruthy()
    if (status === 403) expect(state.context.value).toBeUndefined()
  },
)
it('expires an authenticated shell identity and stops timers after disposal', async () => {
  vi.useFakeTimers()
  vi.mocked(reviewApi.context).mockResolvedValueOnce({
    ...context(true),
    session: { ...context(true).session!, expiresAt: Date.now() + 1000 },
  })
  const { state } = setup()
  await flushPromises()
  await vi.advanceTimersByTimeAsync(1000)
  expect(state.context.value).toBeUndefined()
  expect(state.expired.value).toBe(true)
  scope.stop()
  expect(vi.getTimerCount()).toBe(0)
})
