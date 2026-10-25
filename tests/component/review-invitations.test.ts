import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { useReviewInvitations } from '@/modules/protohub-manager-ui/views/project/hooks/useReviewInvitations'
import ReviewInvitationsDialog from '@/modules/protohub-manager-ui/views/project/components/ReviewInvitationsDialog.vue'
import { reviewInvitationsApi } from '@/modules/protohub-manager-ui/api/review-invitation'
import { sharesApi } from '@/modules/protohub-manager-ui/api'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import type {
  Project,
  Share,
  ReviewInvitation,
  CreatedReviewInvitation,
} from '@/modules/protohub-manager-ui/types'
import type { PageResult } from '@/shared/api/types'
import { permissionKey } from '@/shared/auth/provider'
import { copyText } from '@/shared/utils/feedback'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { hookHarness } from '../fixtures/hook-harness'
import { ownerProjectAccess } from '../fixtures/project-access'
vi.mock('vue-router', () => ({
  useRouter: () => ({ resolve: (path: string) => ({ href: `/tools${path}` }) }),
}))
vi.mock('@/modules/protohub-manager-ui/api/review-invitation', () => ({
  reviewInvitationsApi: { query: vi.fn(), create: vi.fn(), revoke: vi.fn() },
}))
vi.mock('@/modules/protohub-manager-ui/api', () => ({ sharesApi: { reviewPolicy: vi.fn() } }))
vi.mock('@/shared/utils/feedback', () => ({ copyText: vi.fn() }))
const project: Project = {
  id: 'p1',
  name: 'Project',
  createdBy: 'owner',
  createdAt: 1,
  updatedAt: 1,
  ...ownerProjectAccess,
}
const share: Share = {
  id: 's1',
  projectId: 'p1',
  versionId: 'v1',
  token: 'open',
  revisionId: 'r1',
  revisionMode: 'fixed',
  revoked: false,
  configVersion: 2,
  passwordRequired: false,
  enabled: true,
  createdAt: 1,
  sharePath: '/share/open',
}
const invitation = (): ReviewInvitation => ({
  id: 'i1',
  maskedEmail: 'r***@example.invalid',
  status: 'pending',
  configVersion: 0,
  createdAt: 1,
  expiresAt: Date.now() + 86400000,
  consumedAt: null,
})
const result = (data = [invitation()], total = data.length): PageResult<ReviewInvitation> => ({
  data,
  total,
  pageIndex: 0,
  pageSize: 20,
})
const wrappers: VueWrapper[] = []
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { resolve, promise }
}
function setup(grants = [p.share.query, p.share.save] as string[], selected = share) {
  const target = ref({ ...selected }),
    currentProject = ref<Project | undefined>(structuredClone(project)),
    allowed = ref(grants)
  let state!: ReturnType<typeof useReviewInvitations>
  const wrapper = mount(
    hookHarness(() => {
      state = useReviewInvitations(target, currentProject)
    }),
    {
      global: {
        provide: { [permissionKey]: { can: (value: string) => allowed.value.includes(value) } },
      },
    },
  )
  wrappers.push(wrapper)
  return { state, target, currentProject, allowed, wrapper }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(reviewInvitationsApi.query).mockReset().mockResolvedValue(result())
  vi.mocked(sharesApi.reviewPolicy).mockReset().mockResolvedValue({
    enabled: true,
    mailAvailable: true,
    allowUnverified: false,
    configVersion: 9,
  })
  vi.mocked(reviewInvitationsApi.create)
    .mockReset()
    .mockResolvedValue({ invitation: invitation(), invitationToken: 'A'.repeat(43) })
  vi.mocked(reviewInvitationsApi.revoke)
    .mockReset()
    .mockResolvedValue({ ...invitation(), status: 'revoked', configVersion: 1 })
  vi.mocked(copyText).mockResolvedValue(true)
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('intersects project SHARE with query/save and clears secrets and rows when access is removed', async () => {
  const { state, allowed } = setup([])
  expect(reviewInvitationsApi.query).not.toHaveBeenCalled()
  allowed.value = [p.share.query]
  await flushPromises()
  expect(state.rows.value).toHaveLength(1)
  state.email.value = 'recipient@example.invalid'
  await state.create()
  expect(reviewInvitationsApi.create).not.toHaveBeenCalled()
  allowed.value = [p.share.query, p.share.save]
  await flushPromises()
  state.email.value = 'recipient@example.invalid'
  await state.create()
  expect(state.link.value).toContain('#reviewInvitation=')
  allowed.value = [p.share.save]
  expect(state.link.value).toBe('')
  expect(state.rows.value).toEqual([])
  const viewer = setup([p.share.query, p.share.save])
  viewer.currentProject.value = {
    ...project,
    capabilities: { ...project.capabilities, manageShares: false },
  }
  await flushPromises()
  expect(viewer.state.readable.value).toBe(false)
  expect(viewer.state.rows.value).toEqual([])
})
it('creates against the freshly fetched share policy version and copies only on a user gesture', async () => {
  const { state, target } = setup()
  await flushPromises()
  state.email.value = ' recipient@example.invalid '
  await state.create()
  expect(reviewInvitationsApi.create).toHaveBeenCalledExactlyOnceWith(
    's1',
    'recipient@example.invalid',
    9,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
  expect(state.link.value).toBe(
    `${window.location.origin}/tools/share/open#reviewInvitation=${'A'.repeat(43)}`,
  )
  expect(copyText).not.toHaveBeenCalled()
  await state.copy()
  expect(copyText).toHaveBeenCalledExactlyOnceWith(state.link.value, undefined)
  expect(state.email.value).toBe('')
  target.value = { ...share, configVersion: 3 }
  expect(state.link.value).toBe('')
})
it.each(['latest', 'revoked', 'expired', 'disabled', 'review-off'] as const)(
  'does not create from an ineligible share (%s)',
  async (condition) => {
    if (condition === 'review-off')
      vi.mocked(sharesApi.reviewPolicy).mockResolvedValueOnce({
        enabled: false,
        mailAvailable: true,
        configVersion: 9,
        allowUnverified: false,
      })
    const value = {
      ...share,
      ...(condition === 'latest' ? { revisionMode: 'latest' as const } : {}),
      ...(condition === 'revoked' ? { revoked: true } : {}),
      ...(condition === 'expired' ? { expiresAt: Date.now() - 1000 } : {}),
      ...(condition === 'disabled' ? { enabled: false } : {}),
    }
    const { state } = setup(undefined, value)
    await flushPromises()
    state.email.value = 'recipient@example.invalid'
    expect(state.canCreate.value).toBe(false)
    await state.create()
    expect(reviewInvitationsApi.create).not.toHaveBeenCalled()
  },
)
it('keeps terminal and expired records read-only and checks the current row CAS only after confirmation', async () => {
  const { state } = setup()
  await flushPromises()
  for (const status of ['consumed', 'revoked', 'expired', 'invalidated'] as const)
    expect(state.revocable({ ...invitation(), status })).toBe(false)
  expect(state.revocable({ ...invitation(), expiresAt: Date.now() })).toBe(false)
  const old = state.rows.value[0]!
  vi.mocked(reviewInvitationsApi.query).mockResolvedValueOnce(result())
  await state.load()
  await state.revoke(old)
  expect(reviewInvitationsApi.revoke).not.toHaveBeenCalled()
  vi.mocked(reviewInvitationsApi.revoke).mockRejectedValueOnce(new ApiError('Conflict', 409))
  await state.revoke(state.rows.value[0]!)
  expect(reviewInvitationsApi.revoke).toHaveBeenCalledExactlyOnceWith(
    's1',
    'i1',
    0,
    expect.anything(),
  )
  expect(state.notice.value).toBe(protoLocales.zh.reviewInvitationConflict)
})
it('uses bounded real pages and rejects a late page when pagination changes', async () => {
  const late = deferred<PageResult<ReviewInvitation>>()
  vi.mocked(reviewInvitationsApi.query).mockReturnValueOnce(late.promise)
  const { state } = setup()
  const signal = vi.mocked(reviewInvitationsApi.query).mock.calls[0]![2]!.signal as AbortSignal
  vi.mocked(reviewInvitationsApi.query).mockResolvedValueOnce(result([], 30))
  state.page(2)
  expect(signal.aborted).toBe(true)
  await flushPromises()
  late.resolve(result([invitation()], 99))
  await flushPromises()
  expect(state.rows.value).toEqual([])
  expect(state.total.value).toBe(30)
  expect(reviewInvitationsApi.query).toHaveBeenLastCalledWith(
    's1',
    { pageIndex: 1, pageSize: 20 },
    expect.anything(),
  )
})
it.each(['target', 'close'])('discards raw token from a late creation on %s', async (action) => {
  const { state, target, wrapper } = setup()
  await flushPromises()
  const late = deferred<CreatedReviewInvitation>()
  vi.mocked(reviewInvitationsApi.create).mockReturnValueOnce(late.promise)
  state.email.value = 'recipient@example.invalid'
  const creating = state.create()
  const signal = vi.mocked(reviewInvitationsApi.create).mock.calls[0]![3]!.signal as AbortSignal
  if (action === 'target') target.value = { ...share, id: 's2', token: 'other' }
  else {
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
  }
  expect(signal.aborted).toBe(true)
  late.resolve({ invitation: invitation(), invitationToken: 'A'.repeat(43) })
  await creating
  expect(state.link.value).toBe('')
})
it('refreshes a creation conflict without retrying and localizes ambiguous or rate-limited results', async () => {
  const { state } = setup()
  await flushPromises()
  state.email.value = 'recipient@example.invalid'
  vi.mocked(reviewInvitationsApi.create).mockRejectedValueOnce(
    new ApiError('sensitive detail', 409),
  )
  await state.create()
  expect(reviewInvitationsApi.create).toHaveBeenCalledOnce()
  expect(state.notice.value).toBe(protoLocales.zh.reviewInvitationConflict)
  vi.mocked(reviewInvitationsApi.create).mockRejectedValueOnce(new ApiError('recipient', 429))
  await state.create()
  expect(state.notice.value).toBe(protoLocales.zh.reviewInvitationRateLimited)
  expect(state.link.value).toBe('')
})
it('renders a masked pageable list and no creation form for a query-only manager', async () => {
  const wrapper = mount(ReviewInvitationsDialog, {
    props: { share, project },
    global: {
      plugins: [i18n],
      provide: { [permissionKey]: { can: (value: string) => value === p.share.query } },
      stubs: { AModal: { props: ['open'], template: '<div v-if="open"><slot /></div>' } },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.text()).toContain('r***@example.invalid')
  expect(wrapper.find('input[type=email]').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('recipient@example.invalid')
  expect(wrapper.findComponent({ name: 'ActionButton' }).exists()).toBe(false)
})
