import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import PublicApprovalDrawer from '@/modules/protohub-manager-ui/components/PublicApprovalDrawer.vue'
import { revisionApprovalApi as api } from '@/modules/protohub-manager-ui/api/revision-approval'
import type { PublicApproval } from '@/modules/protohub-manager-ui/types/revision-approval'
import type { PublicShare } from '@/modules/protohub-manager-ui/types'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
vi.mock('@/modules/protohub-manager-ui/api/revision-approval', () => ({
  revisionApprovalApi: { publicContext: vi.fn() },
}))
const wrappers: VueWrapper[] = []
const share: PublicShare = {
  token: 'test-share',
  revisionId: 'resolved-old',
  revisionMode: 'latest',
  projectName: 'Project',
  versionName: 'V1',
  passwordRequired: false,
  accessKey: 'grant-old',
  reviewEnabled: false,
}
const old: PublicApproval = {
  revisionId: 'resolved-old',
  approved: true,
  published: false,
  approvedAt: 1,
  publishedAt: null,
}
function render(value = share) {
  const wrapper = mount(PublicApprovalDrawer, {
    props: { share: value },
    global: {
      plugins: [i18n],
      stubs: {
        ADrawer: { template: '<div><slot/></div>' },
        LoadState: { template: '<div><slot/></div>' },
        ATag: { template: '<span><slot/></span>' },
        AAlert: { props: ['message'], template: '<p>{{message}}</p>' },
        AButton: { template: '<button><slot/></button>' },
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'en'
  i18n.global.mergeLocaleMessage('en', { proto: protoLocales.en })
  vi.mocked(api.publicContext).mockResolvedValue(old)
})
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()))
it('reads a latest share using only its already-resolved immutable identity and grant', async () => {
  const w = render()
  await flushPromises()
  expect(api.publicContext).toHaveBeenCalledWith(
    'test-share',
    { revisionId: 'resolved-old', accessKey: 'grant-old' },
    expect.anything(),
  )
  expect(w.text()).toContain('Approved')
  expect(w.text()).not.toContain('Actor')
})
it('aborts and rejects an old response after its public grant and revision change', async () => {
  const pending = deferred<PublicApproval>()
  vi.mocked(api.publicContext).mockReturnValueOnce(pending.promise)
  const w = render()
  await flushPromises()
  const signal = vi.mocked(api.publicContext).mock.calls[0]![2]!.signal
  vi.mocked(api.publicContext).mockResolvedValue({
    ...old,
    revisionId: 'resolved-new',
    approved: false,
    approvedAt: null,
  })
  await w.setProps({ share: { ...share, revisionId: 'resolved-new', accessKey: 'grant-new' } })
  await flushPromises()
  expect(signal?.aborted).toBe(true)
  pending.resolve(old)
  await flushPromises()
  expect(w.text()).toContain('resolved-new')
  expect(w.text()).toContain('Awaiting approval')
  expect(w.text()).not.toContain('resolved-old')
})
it('clears status and does not read when the resolved grant is removed', async () => {
  const w = render()
  await flushPromises()
  await w.setProps({ share: { ...share, accessKey: undefined } })
  await flushPromises()
  expect(api.publicContext).toHaveBeenCalledTimes(1)
  expect(w.text()).not.toContain('Approved at')
})
