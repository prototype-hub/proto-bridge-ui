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
  reviewApi: {
    context: vi.fn(),
    challenge: vi.fn(),
    verify: vi.fn(),
    unverified: vi.fn(),
    logout: vi.fn(),
  },
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
  allowUnverified: false,
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
it.each([
  ['PROTOTYPE_HUB_REVIEW_ORIGIN_DENIED', 'reviewOriginDenied'],
  ['PROTOTYPE_HUB_REVIEW_COOKIE_REQUIRED', 'reviewCookieRequired'],
  ['PROTOTYPE_HUB_REVIEW_CSRF_INVALID', 'reviewCsrfChanged'],
] as const)(
  'distinguishes %s from an expired share and permits an explicit reload',
  async (code, key) => {
    vi.mocked(reviewApi.context).mockRejectedValueOnce(
      new ApiError('do not expose request headers', 403, code),
    )
    const { state } = setup()
    await flushPromises()
    expect(state.error.value).toBe(protoLocales.zh[key])
    expect(state.error.value).not.toBe(protoLocales.zh.reviewAccessChanged)
    expect(state.context.value).toBeUndefined()
    expect(reviewApi.context).toHaveBeenCalledOnce()
    expect(reviewApi.challenge).not.toHaveBeenCalled()
    await state.load()
    expect(state.context.value?.csrfToken).toBe('csrf')
    expect(state.error.value).toBe('')
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
const unverifiedContext = (): ReviewContext => ({
  ...context(),
  allowUnverified: true,
  csrfToken: 'unverified-rotated',
  session: {
    guestId: 'low-guest',
    displayName: 'Visitor',
    company: 'Self declared',
    maskedEmail: null,
    verificationLevel: 'unverified',
    expiresAt: Date.now() + 8 * 3600000,
  },
})
it('keeps email as the primary method and creates name-only identity only after an explicit allowed switch', async () => {
  vi.mocked(reviewApi.context).mockResolvedValueOnce({ ...context(), allowUnverified: true })
  vi.mocked(reviewApi.unverified).mockResolvedValueOnce(unverifiedContext())
  const { state } = setup()
  await flushPromises()
  expect(state.mode.value).toBe('email')
  state.form.displayName = 'Visitor'
  await state.createUnverified()
  expect(reviewApi.unverified).not.toHaveBeenCalled()
  state.chooseMode('unverified')
  expect(state.canSend.value).toBe(false)
  state.form.email = 'must-not-send@example.invalid'
  state.form.displayName = ' Visitor '
  state.form.company = ' Self declared '
  await state.createUnverified()
  expect(reviewApi.unverified).toHaveBeenCalledExactlyOnceWith(
    { token: 'open', revisionId: 'r1', accessKey: 'grant' },
    { displayName: 'Visitor', company: 'Self declared' },
    'csrf',
    expect.any(AbortSignal),
  )
  expect(reviewApi.challenge).not.toHaveBeenCalled()
  expect(reviewApi.verify).not.toHaveBeenCalled()
  expect(state.context.value?.session).toMatchObject({
    maskedEmail: null,
    verificationLevel: 'unverified',
  })
  expect(state.context.value?.csrfToken).toBe('unverified-rotated')
  expect(state.form.email).toBe('')
  state.chooseMode('email')
  expect(state.mode.value).toBe('unverified')
  await state.createUnverified()
  expect(reviewApi.unverified).toHaveBeenCalledOnce()
})
it('does not offer an unverified action without authoritative opt-in, or silently fall back after mail failure', async () => {
  const { state } = setup()
  await flushPromises()
  state.chooseMode('unverified')
  expect(state.mode.value).toBe('email')
  Object.assign(state.form, { email: 'v@example.invalid', displayName: 'V' })
  vi.mocked(reviewApi.challenge).mockRejectedValueOnce(new ApiError('mail down', 503))
  await state.send()
  expect(state.error.value).toBe(protoLocales.zh.reviewMailUnavailable)
  expect(state.mode.value).toBe('email')
  expect(reviewApi.unverified).not.toHaveBeenCalled()
})
it('allows a deliberate unverified choice with mail unavailable and validates name/company without a mailbox', async () => {
  vi.mocked(reviewApi.context).mockResolvedValueOnce({
    ...context(),
    allowUnverified: true,
    mailAvailable: false,
  })
  vi.mocked(reviewApi.unverified).mockResolvedValueOnce(unverifiedContext())
  const { state } = setup()
  await flushPromises()
  expect(state.mode.value).toBe('email')
  expect(state.canSend.value).toBe(false)
  state.chooseMode('unverified')
  state.form.displayName = '  '
  await state.createUnverified()
  expect(state.error.value).toBe(protoLocales.zh.reviewNameRequired)
  state.form.displayName = 'a'.repeat(101)
  await state.createUnverified()
  state.form.displayName = 'V'
  state.form.company = 'c'.repeat(201)
  await state.createUnverified()
  expect(reviewApi.unverified).not.toHaveBeenCalled()
  state.form.company = ''
  await state.createUnverified()
  expect(reviewApi.unverified).toHaveBeenCalledOnce()
  expect(reviewApi.challenge).not.toHaveBeenCalled()
})
it.each(['close', 'grant', 'unmount'])(
  'aborts and ignores a late unverified identity on %s',
  async (action) => {
    vi.mocked(reviewApi.context).mockResolvedValue({ ...context(), allowUnverified: true })
    let resolve!: (value: ReviewContext) => void
    vi.mocked(reviewApi.unverified).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const { state, visible, current } = setup()
    await flushPromises()
    state.chooseMode('unverified')
    state.form.displayName = 'Visitor'
    const pending = state.createUnverified()
    const signal = vi.mocked(reviewApi.unverified).mock.calls[0]![3]!
    if (action === 'close') visible.value = false
    if (action === 'grant') current.value = { ...share(), accessKey: 'new-grant' }
    if (action === 'unmount') scope.stop()
    expect(signal.aborted).toBe(true)
    resolve(unverifiedContext())
    await pending
    expect(state.context.value?.session).not.toBeTruthy()
  },
)
it('reports a conflicting existing identity without switching method, merging or retrying', async () => {
  vi.mocked(reviewApi.context).mockResolvedValueOnce({ ...context(), allowUnverified: true })
  vi.mocked(reviewApi.unverified).mockRejectedValueOnce(
    new ApiError('sensitive server detail', 409),
  )
  const { state } = setup()
  await flushPromises()
  state.chooseMode('unverified')
  state.form.displayName = 'Visitor'
  await state.createUnverified()
  expect(state.error.value).toBe(protoLocales.zh.reviewIdentityConflict)
  expect(state.context.value?.session).toBeNull()
  expect(state.mode.value).toBe('unverified')
  expect(reviewApi.unverified).toHaveBeenCalledOnce()
  expect(reviewApi.logout).not.toHaveBeenCalled()
  expect(reviewApi.challenge).not.toHaveBeenCalled()
})
it('expires an unverified session without renewal or an automatic new identity', async () => {
  vi.useFakeTimers()
  vi.mocked(reviewApi.context).mockResolvedValueOnce({
    ...unverifiedContext(),
    session: { ...unverifiedContext().session!, expiresAt: Date.now() + 1000 },
  })
  const { state } = setup()
  await flushPromises()
  await vi.advanceTimersByTimeAsync(1000)
  expect(state.context.value).toBeUndefined()
  expect(state.expired.value).toBe(true)
  expect(reviewApi.unverified).not.toHaveBeenCalled()
  expect(reviewApi.context).toHaveBeenCalledOnce()
})
it('signs out a low-trust session before allowing a separate email identity, without recovery or automatic send', async () => {
  vi.mocked(reviewApi.context).mockResolvedValueOnce(unverifiedContext())
  const { state } = setup()
  await flushPromises()
  state.chooseMode('unverified')
  expect(state.context.value?.session?.verificationLevel).toBe('unverified')
  await state.logout()
  expect(reviewApi.logout).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    'unverified-rotated',
    expect.any(AbortSignal),
  )
  expect(state.mode.value).toBe('email')
  expect(state.context.value?.session).toBeNull()
  expect(reviewApi.challenge).not.toHaveBeenCalled()
  expect(reviewApi.unverified).not.toHaveBeenCalled()
})
it.each(['email-in-unverified', 'unverified-in-email'])(
  'never installs a contradictory success context (%s)',
  async (action) => {
    vi.mocked(reviewApi.context).mockResolvedValueOnce({ ...context(), allowUnverified: true })
    const { state } = setup()
    await flushPromises()
    if (action === 'email-in-unverified') {
      state.chooseMode('unverified')
      state.form.displayName = 'Visitor'
      vi.mocked(reviewApi.unverified).mockResolvedValueOnce(context(true))
      await state.createUnverified()
      expect(state.error.value).toBe(protoLocales.zh.reviewIdentityConflict)
    } else {
      Object.assign(state.form, { email: 'v@example.invalid', displayName: 'Visitor' })
      await state.send()
      state.form.code = '123456'
      vi.mocked(reviewApi.verify).mockResolvedValueOnce(unverifiedContext())
      await state.verify()
      expect(state.error.value).toBe(protoLocales.zh.reviewUnavailable)
    }
    expect(state.context.value?.session).toBeNull()
    expect(state.context.value?.csrfToken).toBe('csrf')
  },
)
