import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { hookHarness } from '../fixtures/hook-harness'
import { ownerProjectAccess } from '../fixtures/project-access'
import { useReviewAssociations } from '@/modules/protohub-manager-ui/hooks/useReviewAssociations'
import { reviewAssociationsApi as api } from '@/modules/protohub-manager-ui/api/review-association'
import { reviewGuestsApi } from '@/modules/protohub-manager-ui/api/review-guest'
import ReviewAssociationsDrawer from '@/modules/protohub-manager-ui/components/ReviewAssociationsDrawer.vue'
import { permissionKey } from '@/shared/auth/provider'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import type {
  Project,
  ReviewThread,
  ReviewGuest,
  ReviewAssociation,
  ReviewAssociationContext,
} from '@/modules/protohub-manager-ui/types'
vi.mock('@/modules/protohub-manager-ui/api/review-association', () => ({
  reviewAssociationsApi: { detail: vi.fn(), query: vi.fn(), create: vi.fn(), revoke: vi.fn() },
}))
vi.mock('@/modules/protohub-manager-ui/api/review-guest', () => ({
  reviewGuestsApi: { query: vi.fn() },
}))
const thread = (): ReviewThread => ({
  id: 't1',
  revisionId: 'r1',
  pageId: 'page',
  pageName: 'Page',
  pagePath: 'index.html',
  summary: 'Question',
  authorName: '<b>Source</b>',
  authorCompany: null,
  verificationLevel: 'unverified',
  state: 'resolved',
  configVersion: 0,
  createdAt: 1,
  updatedAt: 1,
})
const target = (): ReviewGuest => ({
  id: 'g1',
  displayName: '<b>Target</b>',
  company: 'Company',
  maskedEmail: 't***@example.invalid',
  verificationLevel: 'email',
  enabled: true,
  configVersion: 2,
  createTime: 1,
  modifyTime: 1,
})
const relation = (): ReviewAssociation => ({
  id: 'a1',
  sourceThreadId: 't1',
  versionId: 'v1',
  shareId: 's1',
  revisionId: 'r1',
  targetGuestId: 'g1',
  targetGuest: target(),
  status: 'active',
  invalidReason: null,
  configVersion: 0,
  shareConfigVersion: 3,
  targetGuestConfigVersion: 2,
  evidenceReference: 'Call reference',
  createdBy: 'u1',
  createdByName: 'Owner',
  createdAt: 1,
  revokedBy: null,
  revokedByName: null,
  revokedAt: null,
  revokeReason: null,
})
const detail = (): ReviewAssociationContext => ({
  sourceThread: thread(),
  versionId: 'v1',
  shareId: 's1',
  revisionId: 'r1',
  shareConfigVersion: 3,
  eligible: true,
  unavailableReason: null,
  activeAssociation: null,
})
const pager = <T>(data: T[], total = data.length) => ({ data, total, pageIndex: 0, pageSize: 20 })
const wrappers: VueWrapper[] = []
function setup() {
  const project = ref<Project>({
    id: 'p1',
    name: 'Project',
    createdBy: 'u1',
    createdAt: 1,
    updatedAt: 1,
    ...ownerProjectAccess,
  })
  const source = ref<ReviewThread | undefined>(thread()),
    open = ref(true),
    actor = ref('u1'),
    grants = ref<string[]>([p.project.query, p.project.save])
  let state!: ReturnType<typeof useReviewAssociations>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useReviewAssociations(project, source, open, actor)
      }),
      {
        global: {
          provide: { [permissionKey]: { can: (key: string) => grants.value.includes(key) } },
        },
      },
    ),
  )
  return { project, source, open, actor, grants, state }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function prepare(state: ReturnType<typeof useReviewAssociations>) {
  await flushPromises()
  state.edit('create')
  await flushPromises()
  state.select(state.candidates.value[0]!)
  state.evidence.value = 'Offline call #42'
  state.confirmed.value = true
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.detail).mockReset().mockResolvedValue(detail())
  vi.mocked(api.query).mockReset().mockResolvedValue(pager([]))
  vi.mocked(api.create).mockReset().mockResolvedValue(relation())
  vi.mocked(api.revoke)
    .mockReset()
    .mockResolvedValue({ ...relation(), status: 'revoked' })
  vi.mocked(reviewGuestsApi.query)
    .mockReset()
    .mockResolvedValue(pager([target()], 41))
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
})
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  vi.unstubAllGlobals()
})
it('loads only server-derived context/history and preserves a selected target across bounded server pages', async () => {
  const { state } = setup()
  await prepare(state)
  expect(api.detail).toHaveBeenCalledWith('p1', 't1', expect.anything())
  expect(reviewGuestsApi.query).toHaveBeenCalledWith(
    'p1',
    { verificationLevel: 'email', pageIndex: 0, pageSize: 20 },
    expect.anything(),
  )
  const selected = state.selected.value
  vi.mocked(reviewGuestsApi.query).mockResolvedValueOnce(pager([{ ...target(), id: 'g2' }], 41))
  await state.targets(1)
  expect(state.selected.value).toBe(selected)
  state.save()
  await flushPromises()
  expect(api.create).toHaveBeenCalledWith(
    'p1',
    expect.objectContaining({
      sourceThreadId: 't1',
      targetGuestId: 'g1',
      expectedShareVersion: 3,
      expectedTargetVersion: 2,
      evidenceReference: 'Offline call #42',
    }),
    expect.anything(),
  )
})
it('requires an enabled candidate, verification basis and explicit impact confirmation', async () => {
  const { state } = setup()
  await flushPromises()
  state.edit('create')
  await flushPromises()
  state.select({ ...target(), enabled: false })
  state.save()
  expect(api.create).not.toHaveBeenCalled()
  state.select(state.candidates.value[0]!)
  state.evidence.value = 'Reason'
  state.save()
  expect(api.create).not.toHaveBeenCalled()
  state.confirmed.value = true
  state.save()
  await flushPromises()
  expect(api.create).toHaveBeenCalledTimes(1)
})
it('retains unknown create payload/key through query and changed form values, then retries exactly once', async () => {
  const { state } = setup()
  await prepare(state)
  vi.mocked(api.create).mockRejectedValueOnce(new ApiError('lost', 0))
  state.save()
  await flushPromises()
  const original = vi.mocked(api.create).mock.calls[0]![1]
  expect(state.unknown.value).toBe(true)
  vi.mocked(api.detail).mockResolvedValue({ ...detail(), activeAssociation: relation() })
  await state.load()
  state.evidence.value = 'Changed'
  state.selected.value = { ...target(), id: 'other' }
  state.save()
  expect(api.create).toHaveBeenCalledTimes(1)
  state.retry()
  await flushPromises()
  expect(vi.mocked(api.create).mock.calls[1]![1]).toBe(original)
  expect(state.unknown.value).toBe(false)
})
it('revokes an invalidated grant even with unavailable share, and retries the original revoke payload', async () => {
  vi.mocked(api.detail).mockResolvedValue({
    ...detail(),
    eligible: false,
    unavailableReason: 'SHARE_UNAVAILABLE',
    activeAssociation: { ...relation(), status: 'invalidated' },
  })
  const { state } = setup()
  await flushPromises()
  state.edit('revoke')
  state.reason.value = 'Wrong recipient'
  state.confirmed.value = true
  vi.mocked(api.revoke).mockRejectedValueOnce(new ApiError('lost', 503))
  state.save()
  await flushPromises()
  const original = vi.mocked(api.revoke).mock.calls[0]![2]
  await state.load()
  state.reason.value = 'Changed'
  state.retry()
  await flushPromises()
  expect(vi.mocked(api.revoke).mock.calls[1]![2]).toBe(original)
  expect(original).toMatchObject({ expectedVersion: 0, reason: 'Wrong recipient' })
})
it('refreshes a conflict without success, automatic retry, or silently replacing the active slot', async () => {
  const { state } = setup()
  await prepare(state)
  vi.mocked(api.create).mockRejectedValueOnce(new ApiError('conflict', 409))
  vi.mocked(api.detail).mockResolvedValue({
    ...detail(),
    activeAssociation: { ...relation(), status: 'invalidated' },
  })
  state.save()
  await flushPromises()
  expect(state.notice.value).toBe(protoLocales.zh.associationConflict)
  expect(state.unknown.value).toBe(false)
  expect(state.mode.value).toBe('overview')
  state.edit('create')
  state.save()
  expect(api.create).toHaveBeenCalledTimes(1)
})
it.each(['source', 'actor', 'permission', 'close'] as const)(
  'aborts late writes on %s changes without showing another scope',
  async (kind) => {
    const { state, source, actor, grants, open } = setup()
    await prepare(state)
    const delayed = deferred<ReviewAssociation>()
    vi.mocked(api.create).mockReturnValueOnce(delayed.promise)
    state.save()
    const signal = vi.mocked(api.create).mock.calls[0]![2]!.signal!
    if (kind === 'source') source.value = undefined
    if (kind === 'actor') actor.value = 'other'
    if (kind === 'permission') grants.value = []
    if (kind === 'close') open.value = false
    expect(signal.aborted).toBe(true)
    delayed.resolve(relation())
    await flushPromises()
    expect(state.notice.value).not.toBe(protoLocales.zh.associationCreated)
  },
)
it('clears private sibling results on denied access and never uses share action permissions as project authorization', async () => {
  const { state, grants } = setup()
  await prepare(state)
  vi.mocked(api.detail).mockRejectedValueOnce(new ApiError('denied', 403))
  await state.load()
  expect(state.candidates.value).toEqual([])
  expect(state.selected.value).toBeUndefined()
  expect(state.history.value).toEqual([])
  expect(state.error.value).toBe(protoLocales.zh.associationAccessChanged)
  grants.value = [p.share.query, p.share.save]
  await flushPromises()
  expect(state.readable.value).toBe(false)
  expect(state.error.value).toBe(protoLocales.zh.associationAccessChanged)
})
it('renders source and target as plain text and labels target, evidence, scope, impact and recovery', async () => {
  const { state } = setup()
  await prepare(state)
  const wrapper = mount(ReviewAssociationsDrawer, {
    props: { open: true, state, projectName: 'Project', versionName: 'V1' },
    global: { plugins: [i18n], stubs: { ADrawer: { template: '<div><slot /></div>' } } },
  })
  wrappers.push(wrapper)
  expect(wrapper.text()).toContain('<b>Source</b>')
  expect(wrapper.text()).toContain('<b>Target</b>')
  expect(wrapper.find('b').exists()).toBe(false)
  expect(wrapper.get('label[for="association-evidence"]').text()).toBe(
    protoLocales.zh.associationEvidence,
  )
  expect(wrapper.get('#association-evidence').attributes('aria-describedby')).toBe(
    'association-evidence-help',
  )
  expect(wrapper.find('[role="radiogroup"]').attributes('aria-label')).toBe(
    protoLocales.zh.associationChooseTarget,
  )
  expect(wrapper.text()).toContain(protoLocales.zh.associationGrantImpact)
})
