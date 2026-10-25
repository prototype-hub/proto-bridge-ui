import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ReviewPolicyDialog from '@/modules/protohub-manager-ui/views/project/components/ReviewPolicyDialog.vue'
import { sharesApi } from '@/modules/protohub-manager-ui/api'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import type { Share, ReviewPolicy } from '@/modules/protohub-manager-ui/types'
vi.mock('@/modules/protohub-manager-ui/api', () => ({
  sharesApi: { reviewPolicy: vi.fn(), setReviewPolicy: vi.fn() },
}))
const wrappers: VueWrapper[] = []
const share: Share = {
  id: 's1',
  token: 'token',
  projectId: 'p',
  versionId: 'v',
  revisionId: 'r',
  revisionMode: 'fixed',
  revoked: false,
  configVersion: 2,
  passwordRequired: false,
  enabled: true,
  createdAt: 1,
  sharePath: '/share/token',
}
function setup() {
  const wrapper = mount(ReviewPolicyDialog, {
    props: { share: { ...share } },
    global: {
      plugins: [i18n],
      stubs: {
        FormModal: {
          name: 'FormModal',
          props: ['open', 'title', 'model', 'busy', 'error', 'width'],
          template: '<div><slot /></div>',
        },
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  vi.mocked(sharesApi.reviewPolicy).mockResolvedValue({
    enabled: false,
    mailAvailable: true,
    allowUnverified: false,
    configVersion: 9,
  })
  vi.mocked(sharesApi.setReviewPolicy).mockResolvedValue({
    enabled: true,
    mailAvailable: true,
    allowUnverified: false,
    configVersion: 10,
  })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})
it('saves the fetched policy CAS version, not a stale share list version', async () => {
  const wrapper = setup()
  await flushPromises()
  await wrapper.get(`[role=switch][aria-label="${protoLocales.zh.reviewEnable}"]`).trigger('click')
  wrapper.findComponent({ name: 'FormModal' }).vm.$emit('submit')
  await flushPromises()
  expect(sharesApi.setReviewPolicy).toHaveBeenCalledWith(
    's1',
    true,
    9,
    false,
    false,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
  expect(wrapper.emitted('saved')).toEqual([
    [{ enabled: true, mailAvailable: true, allowUnverified: false, configVersion: 10 }],
  ])
})
it('refreshes after CAS conflict and requires another explicit save', async () => {
  const wrapper = setup()
  await flushPromises()
  vi.mocked(sharesApi.setReviewPolicy).mockRejectedValueOnce(new ApiError('Conflict', 409))
  wrapper.findComponent({ name: 'FormModal' }).vm.$emit('submit')
  await flushPromises()
  expect(sharesApi.reviewPolicy).toHaveBeenCalledTimes(2)
  expect(sharesApi.setReviewPolicy).toHaveBeenCalledOnce()
  expect(wrapper.emitted('saved')).toBeUndefined()
  expect(wrapper.findComponent({ name: 'FormModal' }).props('error')).toBe(
    protoLocales.zh.shareConflict,
  )
})
it('aborts a late policy response on unmount without emitting a saved event', async () => {
  let resolve!: (value: ReviewPolicy) => void
  vi.mocked(sharesApi.reviewPolicy).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const wrapper = setup()
  const signal = vi.mocked(sharesApi.reviewPolicy).mock.calls[0]![1]!.signal as AbortSignal
  wrapper.unmount()
  wrappers.pop()
  expect(signal.aborted).toBe(true)
  resolve({ enabled: true, mailAvailable: true, allowUnverified: false, configVersion: 9 })
  await flushPromises()
  expect(wrapper.emitted('saved')).toBeUndefined()
})
it('requires an explicit unverified opt-in and sends false again when it is turned off', async () => {
  const wrapper = setup()
  await flushPromises()
  const main = wrapper.get(`[role=switch][aria-label="${protoLocales.zh.reviewEnable}"]`)
  const unverified = wrapper.get(
    `[role=switch][aria-label="${protoLocales.zh.reviewAllowUnverified}"]`,
  )
  expect(unverified.attributes('aria-checked')).toBe('false')
  expect(unverified.attributes('disabled')).toBeDefined()
  await main.trigger('click')
  await unverified.trigger('click')
  wrapper.findComponent({ name: 'FormModal' }).vm.$emit('submit')
  await flushPromises()
  expect(sharesApi.setReviewPolicy).toHaveBeenLastCalledWith(
    's1',
    true,
    9,
    true,
    false,
    expect.anything(),
  )
  await unverified.trigger('click')
  wrapper.findComponent({ name: 'FormModal' }).vm.$emit('submit')
  await flushPromises()
  expect(sharesApi.setReviewPolicy).toHaveBeenLastCalledWith(
    's1',
    true,
    10,
    false,
    false,
    expect.anything(),
  )
  expect(wrapper.text()).toContain(protoLocales.zh.reviewUnverifiedHint)
})

it('defaults old feedback policy to false, saves explicit opt-in and clears it when identity is disabled', async () => {
  const wrapper = setup()
  await flushPromises()
  const main = wrapper.get(`[role=switch][aria-label="${protoLocales.zh.reviewEnable}"]`)
  const feedback = wrapper.get(`[role=switch][aria-label="${protoLocales.zh.feedbackAllow}"]`)
  expect(feedback.attributes('aria-checked')).toBe('false')
  expect(feedback.attributes('disabled')).toBeDefined()
  await main.trigger('click')
  await feedback.trigger('click')
  wrapper.findComponent({ name: 'FormModal' }).vm.$emit('submit')
  await flushPromises()
  expect(sharesApi.setReviewPolicy).toHaveBeenLastCalledWith(
    's1',
    true,
    9,
    false,
    true,
    expect.anything(),
  )
  await main.trigger('click')
  wrapper.findComponent({ name: 'FormModal' }).vm.$emit('submit')
  await flushPromises()
  expect(sharesApi.setReviewPolicy).toHaveBeenLastCalledWith(
    's1',
    false,
    10,
    false,
    false,
    expect.anything(),
  )
})
