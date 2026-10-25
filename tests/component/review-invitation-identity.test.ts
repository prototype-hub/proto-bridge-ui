import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { useReviewIdentity } from '@/modules/protohub-manager-ui/views/share/hooks/useReviewIdentity'
import ReviewIdentityDrawer from '@/modules/protohub-manager-ui/views/share/components/ReviewIdentityDrawer.vue'
import { reviewApi } from '@/modules/protohub-manager-ui/api/review'
import type {
  PublicShare,
  ReviewContext,
  ReviewChallenge,
} from '@/modules/protohub-manager-ui/types'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
vi.mock('@/modules/protohub-manager-ui/api/review', () => ({
  reviewApi: {
    context: vi.fn(),
    challenge: vi.fn(),
    verify: vi.fn(),
    logout: vi.fn(),
    unverified: vi.fn(),
  },
}))
const token = 'A'.repeat(43)
const share: PublicShare = {
  token: 'open',
  revisionMode: 'fixed',
  revisionId: 'r1',
  accessKey: 'grant',
  projectName: 'P',
  versionName: 'V',
  passwordRequired: false,
  reviewEnabled: true,
  reviewUnverifiedAllowed: true,
}
const context = (level?: 'email' | 'unverified'): ReviewContext => ({
  revisionId: 'r1',
  enabled: true,
  mailAvailable: true,
  allowUnverified: true,
  csrfToken: 'csrf',
  session: level
    ? {
        guestId: 'guest',
        displayName: 'Old identity',
        company: null,
        maskedEmail: level === 'email' ? 'o***@example.invalid' : null,
        verificationLevel: level,
        expiresAt: Date.now() + 8 * 3600000,
      }
    : null,
})
const challenge = (): ReviewChallenge => ({
  challengeId: 'c1',
  expiresAt: Date.now() + 300000,
  resendAfter: Date.now() + 60000,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
let scope: EffectScope, wrapper: VueWrapper | undefined
function setup(value: string | null | undefined = token) {
  const invitation = ref<string | null | undefined>(value),
    selected = ref<PublicShare | undefined>({ ...share }),
    open = ref(true)
  const state = scope.run(() => useReviewIdentity(selected, open, invitation))!
  return { state, invitation, selected, open }
}
function profile(state: ReturnType<typeof useReviewIdentity>) {
  Object.assign(state.form, {
    email: 'recipient@example.invalid',
    displayName: 'Recipient',
    company: 'Company',
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  scope = effectScope()
  vi.mocked(reviewApi.context).mockReset().mockResolvedValue(context())
  vi.mocked(reviewApi.challenge).mockReset().mockResolvedValue(challenge())
  vi.mocked(reviewApi.verify).mockReset().mockResolvedValue(context('email'))
  vi.mocked(reviewApi.logout).mockReset().mockResolvedValue({ loggedOut: true })
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
})
afterEach(() => {
  scope.stop()
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})
it('binds only the challenge to the pending token, verifies with the existing request and clears it only after success', async () => {
  const { state, invitation } = setup()
  await flushPromises()
  profile(state)
  await state.send()
  expect(reviewApi.challenge).toHaveBeenCalledExactlyOnceWith(
    { token: 'open', revisionId: 'r1', accessKey: 'grant' },
    {
      email: 'recipient@example.invalid',
      displayName: 'Recipient',
      company: 'Company',
      invitationToken: token,
    },
    'csrf',
    expect.any(AbortSignal),
  )
  state.form.code = '111111'
  vi.mocked(reviewApi.verify).mockRejectedValueOnce(
    new ApiError('private', 400, 'PROTOTYPE_HUB_REVIEW_CODE_INVALID'),
  )
  expect(await state.verify()).toBe(false)
  expect(invitation.value).toBe(token)
  state.form.code = '123456'
  expect(await state.verify()).toBe(true)
  expect(reviewApi.verify).toHaveBeenLastCalledWith(
    { token: 'open', revisionId: 'r1', accessKey: 'grant' },
    'c1',
    '123456',
    'csrf',
    expect.any(AbortSignal),
  )
  invitation.value = undefined
  expect(state.context.value?.session?.verificationLevel).toBe('email')
  expect(state.challenge.value).toBeUndefined()
  expect(state.form.email).toBe('')
})
it.each(['email', 'unverified'] as const)(
  'requires explicit logout and fresh OTP with an existing %s session while retaining invitation',
  async (level) => {
    vi.mocked(reviewApi.context).mockResolvedValueOnce(context(level))
    const { state, invitation } = setup()
    await flushPromises()
    profile(state)
    await state.send()
    await state.verify()
    state.chooseMode('unverified')
    await state.createUnverified()
    expect(reviewApi.challenge).not.toHaveBeenCalled()
    expect(reviewApi.verify).not.toHaveBeenCalled()
    expect(reviewApi.unverified).not.toHaveBeenCalled()
    expect(reviewApi.logout).not.toHaveBeenCalled()
    expect(state.mode.value).toBe('email')
    await state.logout()
    expect(invitation.value).toBe(token)
    expect(state.context.value?.session).toBeNull()
    profile(state)
    await state.send()
    expect(reviewApi.challenge).toHaveBeenCalledOnce()
    expect(vi.mocked(reviewApi.challenge).mock.calls[0]![1].invitationToken).toBe(token)
  },
)
it('keeps an explicit invalid fragment blocked until an explicit abandon permits ordinary independent identity', async () => {
  const { state, invitation } = setup(null)
  await flushPromises()
  profile(state)
  await state.send()
  state.chooseMode('unverified')
  await state.createUnverified()
  expect(state.mode.value).toBe('email')
  expect(reviewApi.challenge).not.toHaveBeenCalled()
  expect(reviewApi.unverified).not.toHaveBeenCalled()
  invitation.value = undefined
  profile(state)
  await state.send()
  expect(vi.mocked(reviewApi.challenge).mock.calls[0]![1]).not.toHaveProperty('invitationToken')
})
it.each([400, 403])(
  'keeps a rejected invitation (%s) explicit, hides raw server details and never automatically falls back',
  async (status) => {
    const { state, invitation } = setup()
    await flushPromises()
    profile(state)
    vi.mocked(reviewApi.challenge).mockRejectedValueOnce(
      new ApiError('recipient and raw token', status, 'PROTOTYPE_HUB_REVIEW_INVITATION_INVALID'),
    )
    await state.send()
    expect(state.error.value).toBe(protoLocales.zh.reviewInvitationInvalid)
    expect(state.context.value?.session).toBeNull()
    expect(invitation.value).toBe(token)
    expect(reviewApi.challenge).toHaveBeenCalledOnce()
    expect(reviewApi.verify).not.toHaveBeenCalled()
    expect(reviewApi.unverified).not.toHaveBeenCalled()
    state.chooseMode('unverified')
    expect(state.mode.value).toBe('email')
    state.form.email = 'correct@example.invalid'
    await state.send()
    expect(vi.mocked(reviewApi.challenge).mock.calls[1]![1].invitationToken).toBe(token)
  },
)
it.each(['abandon', 'profile', 'close', 'target'] as const)(
  'aborts an old recipient challenge on %s and ignores its late response',
  async (action) => {
    const { state, invitation, open, selected } = setup()
    await flushPromises()
    profile(state)
    const pending = deferred<ReviewChallenge>()
    vi.mocked(reviewApi.challenge).mockReturnValueOnce(pending.promise)
    const sending = state.send(),
      signal = vi.mocked(reviewApi.challenge).mock.calls[0]![3]!
    if (action === 'abandon') invitation.value = undefined
    if (action === 'profile') state.form.email = 'other@example.invalid'
    if (action === 'close') open.value = false
    if (action === 'target') selected.value = { ...share, token: 'other' }
    expect(signal.aborted).toBe(true)
    pending.resolve(challenge())
    await sending
    expect(state.challenge.value).toBeUndefined()
    expect(state.busy.value).toBe(false)
  },
)
it('does not install a late successful identity after an explicit abandon', async () => {
  const { state, invitation } = setup()
  await flushPromises()
  profile(state)
  await state.send()
  state.form.code = '123456'
  const pending = deferred<ReviewContext>()
  vi.mocked(reviewApi.verify).mockReturnValueOnce(pending.promise)
  const verifying = state.verify()
  invitation.value = undefined
  pending.resolve(context('email'))
  expect(await verifying).toBe(false)
  expect(state.context.value?.session).toBeNull()
})
it('does not offer unverified fallback when invited mail is unavailable', async () => {
  vi.mocked(reviewApi.context).mockResolvedValueOnce({ ...context(), mailAvailable: false })
  const { state } = setup()
  await flushPromises()
  profile(state)
  state.chooseMode('unverified')
  await state.send()
  await state.createUnverified()
  expect(state.mode.value).toBe('email')
  expect(reviewApi.unverified).not.toHaveBeenCalled()
  expect(reviewApi.challenge).not.toHaveBeenCalled()
})
it('renders explicit invitation intent, emits abandon and successful use, and never exposes a name-only shortcut', async () => {
  wrapper = mount(ReviewIdentityDrawer, {
    props: { state: setup().state, open: true, invitation: token },
    global: {
      plugins: [i18n],
      stubs: { ADrawer: { props: ['open'], template: '<div v-if="open"><slot /></div>' } },
    },
  })
  await flushPromises()
  expect(wrapper.text()).toContain(protoLocales.zh.reviewInvitationRecipientHint)
  expect(wrapper.text()).not.toContain(protoLocales.zh.reviewUseUnverified)
  const abandon = wrapper
    .findAll('button')
    .find((item) => item.text() === protoLocales.zh.reviewInvitationAbandon)!
  await abandon.trigger('click')
  expect(wrapper.emitted('abandonInvitation')).toHaveLength(1)
  await wrapper.find('input[type=email]').setValue('recipient@example.invalid')
  const inputs = wrapper.findAll('input')
  await inputs[1]!.setValue('Recipient')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  await wrapper.find('input[autocomplete=one-time-code]').setValue('123456')
  await wrapper
    .findAll('button')
    .find((item) => item.text() === protoLocales.zh.reviewVerify)!
    .trigger('click')
  await flushPromises()
  expect(wrapper.emitted('invitationUsed')).toHaveLength(1)
})
