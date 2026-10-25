import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { useReviewIdentity } from '@/modules/protohub-manager-ui/views/share/hooks/useReviewIdentity'
import ReviewIdentityDrawer from '@/modules/protohub-manager-ui/views/share/components/ReviewIdentityDrawer.vue'
import { reviewApi } from '@/modules/protohub-manager-ui/api/review'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import type { ReviewContext, PublicShare } from '@/modules/protohub-manager-ui/types'
vi.mock('@/modules/protohub-manager-ui/api/review', () => ({
  reviewApi: {
    context: vi.fn(),
    challenge: vi.fn(),
    verify: vi.fn(),
    unverified: vi.fn(),
    logout: vi.fn(),
  },
}))
const share: PublicShare = {
  token: 'open',
  revisionId: 'r1',
  accessKey: 'grant',
  revisionMode: 'fixed',
  projectName: 'P',
  versionName: 'V',
  passwordRequired: false,
  reviewEnabled: true,
  reviewUnverifiedAllowed: true,
}
const context = (): ReviewContext => ({
  revisionId: 'r1',
  enabled: true,
  mailAvailable: true,
  allowUnverified: true,
  csrfToken: 'csrf',
  session: null,
})
let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
  vi.mocked(reviewApi.context).mockResolvedValue(context())
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})
function setup() {
  wrapper = mount(
    defineComponent({
      setup() {
        const state = useReviewIdentity(ref(share), ref(true))
        return () => h(ReviewIdentityDrawer, { state, open: true })
      },
    }),
    {
      global: {
        plugins: [i18n],
        stubs: { ADrawer: { props: ['open'], template: '<div v-if="open"><slot /></div>' } },
      },
    },
  )
  return wrapper
}
it('requires explicit method choice and removes the email input entirely from name-only mode', async () => {
  const view = setup()
  await flushPromises()
  expect(view.find('input[type="email"]').exists()).toBe(true)
  const choice = view
    .findAll('button')
    .find((button) => button.text() === protoLocales.zh.reviewUseUnverified)!
  await choice.trigger('click')
  expect(view.find('input[type="email"]').exists()).toBe(false)
  expect(view.text()).toContain(protoLocales.zh.reviewUnverifiedHint)
  expect(view.text()).toContain(protoLocales.zh.reviewCreateUnverified)
  expect(view.text()).not.toContain(protoLocales.zh.reviewSendCode)
  expect(reviewApi.unverified).not.toHaveBeenCalled()
  expect(reviewApi.challenge).not.toHaveBeenCalled()
})
it('renders an unverified warning and expiry without a verified badge, email or editable profile', async () => {
  const expiresAt = Date.now() + 8 * 3600000
  vi.mocked(reviewApi.context).mockResolvedValueOnce({
    ...context(),
    session: {
      guestId: 'low',
      displayName: 'Visitor',
      company: 'Self declared',
      maskedEmail: null,
      verificationLevel: 'unverified',
      expiresAt,
    },
  })
  const view = setup()
  await flushPromises()
  expect(view.text()).toContain(protoLocales.zh.reviewUnverified)
  expect(view.text()).toContain(protoLocales.zh.reviewUnverifiedHint)
  expect(view.text()).toContain('Visitor')
  expect(view.text()).toContain(new Date(expiresAt).toLocaleString())
  expect(view.text()).not.toContain(protoLocales.zh.reviewEmailVerified)
  expect(view.find('input').exists()).toBe(false)
  expect(
    view.findAll('button').some((button) => button.text() === protoLocales.zh.reviewLogout),
  ).toBe(true)
})
it('does not expose a name-only choice when an old or non-opted-in context returns false', async () => {
  vi.mocked(reviewApi.context).mockResolvedValueOnce({ ...context(), allowUnverified: false })
  const view = setup()
  await flushPromises()
  expect(view.text()).not.toContain(protoLocales.zh.reviewUseUnverified)
  expect(view.find('input[type="email"]').exists()).toBe(true)
})
