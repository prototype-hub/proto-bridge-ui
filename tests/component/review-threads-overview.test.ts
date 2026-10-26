import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import {
  useReviewThreadsOverview,
  type ReviewOverviewScope,
} from '@/modules/protohub-manager-ui/hooks/useReviewThreadsOverview'
import ReviewThreadsOverviewDrawer from '@/modules/protohub-manager-ui/components/ReviewThreadsOverviewDrawer.vue'
import {
  publicReviewThreadsApi,
  reviewThreadsApi,
} from '@/modules/protohub-manager-ui/api/review-thread'
import type { ReviewContext, ReviewThread } from '@/modules/protohub-manager-ui/types'
import { permissionKey } from '@/shared/auth/provider'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { ApiError } from '@/shared/api/errors'
import { hookHarness } from '../fixtures/hook-harness'
import { ownerProjectAccess } from '../fixtures/project-access'
vi.mock('@/modules/protohub-manager-ui/api/review-thread', () => ({
  publicReviewThreadsApi: { overview: vi.fn() },
  reviewThreadsApi: { overview: vi.fn() },
}))
const context = (): ReviewContext => ({
  revisionId: 'r1',
  enabled: true,
  allowComment: true,
  allowUnverified: true,
  mailAvailable: true,
  csrfToken: 'csrf',
  session: {
    guestId: 'g1',
    displayName: 'Visitor',
    company: null,
    maskedEmail: 'v***@example.invalid',
    verificationLevel: 'email',
    expiresAt: Date.now() + 3600000,
  },
})
const publicScope = (): ReviewOverviewScope => ({
  kind: 'public',
  revisionId: 'r1',
  pendingInvitation: false,
  share: {
    token: 'open',
    accessKey: 'grant',
    revisionId: 'r1',
    revisionMode: 'fixed',
    projectName: 'Project',
    versionName: 'V1',
    reviewEnabled: true,
    passwordRequired: false,
  },
})
const memberScope = (): ReviewOverviewScope => ({
  kind: 'member',
  revisionId: 'r1',
  versionId: 'v1',
  actorId: 'member',
  project: {
    id: 'p1',
    name: 'Project',
    createdBy: 'u1',
    createdAt: 1,
    updatedAt: 1,
    ...ownerProjectAccess,
  },
})
const row = (pageId = 'page1'): ReviewThread => ({
  id: 'a'.repeat(43),
  revisionId: 'r1',
  pageId,
  pageName: '<script>Page</script>',
  pagePath: `nested/${pageId}.html`,
  summary: '<img src=x>Question',
  authorName: 'Visitor',
  authorCompany: null,
  verificationLevel: 'email',
  state: 'open',
  configVersion: 0,
  createdAt: 1,
  updatedAt: 1,
})
const pager = (data = [row()], total = data.length) => ({ data, total, pageIndex: 0, pageSize: 20 })
const wrappers: VueWrapper[] = []
function setup(initial: ReviewOverviewScope | undefined = publicScope(), active = true) {
  const scope = ref(initial),
    open = ref(active),
    identity = shallowRef<ReviewContext | undefined>(context()),
    grants = ref([p.version.query] as string[])
  let state!: ReturnType<typeof useReviewThreadsOverview>
  const wrapper = mount(
    hookHarness(() => {
      state = useReviewThreadsOverview(scope, open, identity)
    }),
    {
      global: {
        provide: { [permissionKey]: { can: (key: string) => grants.value.includes(key) } },
      },
    },
  )
  wrappers.push(wrapper)
  return { scope, open, identity, grants, state }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(publicReviewThreadsApi.overview).mockReset().mockResolvedValue(pager())
  vi.mocked(reviewThreadsApi.overview).mockReset().mockResolvedValue(pager())
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  i18n.global.mergeLocaleMessage('en', { proto: protoLocales.en })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

it('queries one revision page only, carries public CSRF, preserves real total on an empty far page and clears the state filter', async () => {
  const { state } = setup()
  await flushPromises()
  expect(publicReviewThreadsApi.overview).toHaveBeenCalledWith(
    { token: 'open', revisionId: 'r1', accessKey: 'grant' },
    { revisionId: 'r1', pageIndex: 0, pageSize: 20 },
    'csrf',
    expect.any(AbortSignal),
  )
  expect(state.rows.value).toHaveLength(1)
  state.changeFilter('resolved')
  await flushPromises()
  expect(publicReviewThreadsApi.overview).toHaveBeenLastCalledWith(
    expect.anything(),
    { revisionId: 'r1', pageIndex: 0, pageSize: 20, state: 'resolved' },
    'csrf',
    expect.anything(),
  )
  vi.mocked(publicReviewThreadsApi.overview).mockResolvedValueOnce(pager([], 47))
  state.page(10001)
  await flushPromises()
  expect(state.rows.value).toEqual([])
  expect(state.total.value).toBe(47)
  expect(state.pageIndex.value).toBe(10000)
  state.changeFilter('')
  await flushPromises()
  expect(state.pageIndex.value).toBe(0)
  expect(vi.mocked(publicReviewThreadsApi.overview).mock.calls.at(-1)![1]).not.toHaveProperty(
    'state',
  )
  expect(reviewThreadsApi.overview).not.toHaveBeenCalled()
})

it.each([
  'closed',
  'no-session',
  'expired',
  'invitation',
  'disabled',
  'no-comments',
  'latest',
  'wrong-revision',
] as const)('does not query public overview for %s', async (kind) => {
  const selected = publicScope()
  if (selected.kind !== 'public') throw new Error('public fixture')
  if (kind === 'invitation') selected.pendingInvitation = true
  if (kind === 'disabled') selected.share.reviewEnabled = false
  if (kind === 'latest') selected.share.revisionMode = 'latest'
  const { identity, state, open } = setup(selected, false)
  if (kind === 'no-session') identity.value = { ...context(), session: null }
  if (kind === 'expired')
    identity.value = { ...context(), session: { ...context().session!, expiresAt: Date.now() - 1 } }
  if (kind === 'no-comments') identity.value = { ...context(), allowComment: false }
  if (kind === 'wrong-revision') identity.value = { ...context(), revisionId: 'foreign' }
  if (kind !== 'closed') open.value = true
  await flushPromises()
  // The request action repeats authorization even if a rendered control has gone stale.
  await state.load()
  expect(publicReviewThreadsApi.overview).not.toHaveBeenCalled()
})

it('gates member overview by current project EDIT and query permission, with no save permission needed', async () => {
  const { scope, grants, state } = setup(memberScope())
  await flushPromises()
  expect(reviewThreadsApi.overview).toHaveBeenCalledWith(
    'v1',
    { revisionId: 'r1', pageIndex: 0, pageSize: 20 },
    expect.objectContaining({ silent: true }),
  )
  grants.value = []
  await flushPromises()
  expect(state.rows.value).toEqual([])
  vi.clearAllMocks()
  await state.load()
  expect(reviewThreadsApi.overview).not.toHaveBeenCalled()
  scope.value = {
    ...memberScope(),
    project: {
      ...(memberScope() as Extract<ReviewOverviewScope, { kind: 'member' }>).project,
      capabilities: { ...ownerProjectAccess.capabilities, edit: false },
    },
  } as ReviewOverviewScope
  grants.value = [p.version.query]
  await flushPromises()
  expect(reviewThreadsApi.overview).not.toHaveBeenCalled()
})

it('combines responsibility and state in one bounded member request, resets pages and clears both filters', async () => {
  const { state, open } = setup(memberScope())
  await flushPromises()
  state.page(3)
  await flushPromises()
  let calls = vi.mocked(reviewThreadsApi.overview).mock.calls.length
  state.changeAssignment('mine')
  await flushPromises()
  expect(reviewThreadsApi.overview).toHaveBeenCalledTimes(++calls)
  expect(state.pageIndex.value).toBe(0)
  expect(vi.mocked(reviewThreadsApi.overview).mock.calls.at(-1)![1]).toEqual({
    revisionId: 'r1',
    pageIndex: 0,
    pageSize: 20,
    assignment: 'mine',
  })
  state.changeFilter('resolved')
  await flushPromises()
  expect(reviewThreadsApi.overview).toHaveBeenCalledTimes(++calls)
  state.page(2)
  await flushPromises()
  expect(reviewThreadsApi.overview).toHaveBeenCalledTimes(++calls)
  const query = {
    revisionId: 'r1',
    pageIndex: 1,
    pageSize: 20,
    state: 'resolved',
    assignment: 'mine',
  }
  expect(vi.mocked(reviewThreadsApi.overview).mock.calls.at(-1)![1]).toEqual(query)
  vi.mocked(reviewThreadsApi.overview).mockRejectedValueOnce(new ApiError('unavailable', 500))
  await state.load()
  expect(state.error.value).toBeTruthy()
  expect(reviewThreadsApi.overview).toHaveBeenCalledTimes(++calls)
  await state.load()
  expect(reviewThreadsApi.overview).toHaveBeenCalledTimes(++calls)
  expect(vi.mocked(reviewThreadsApi.overview).mock.calls.at(-1)![1]).toEqual(query)
  open.value = false
  await flushPromises()
  open.value = true
  await flushPromises()
  expect(state.assignment.value).toBe('mine')
  expect(vi.mocked(reviewThreadsApi.overview).mock.calls.at(-1)![1]).toEqual(query)
  state.changeAssignment('unassigned')
  await flushPromises()
  expect(vi.mocked(reviewThreadsApi.overview).mock.calls.at(-1)![1]).toEqual({
    ...query,
    pageIndex: 0,
    assignment: 'unassigned',
  })
  calls = vi.mocked(reviewThreadsApi.overview).mock.calls.length
  state.clearFilters()
  await flushPromises()
  expect(reviewThreadsApi.overview).toHaveBeenCalledTimes(calls + 1)
  expect(state.filter.value).toBe('')
  expect(state.assignment.value).toBe('')
  expect(vi.mocked(reviewThreadsApi.overview).mock.calls.at(-1)![1]).toEqual({
    revisionId: 'r1',
    pageIndex: 0,
    pageSize: 20,
  })
})

it.each(['project', 'version', 'revision', 'actor', 'no-actor', 'public'] as const)(
  'clears both member filters on %s changes and rejects the old result',
  async (kind) => {
    const { state, scope } = setup(memberScope())
    await flushPromises()
    state.changeFilter('open')
    await flushPromises()
    const delayed = deferred<ReturnType<typeof pager>>()
    vi.mocked(reviewThreadsApi.overview).mockReturnValueOnce(delayed.promise)
    state.changeAssignment('mine')
    const signal = vi.mocked(reviewThreadsApi.overview).mock.calls.at(-1)![2]!.signal!
    const selected = memberScope() as Extract<ReviewOverviewScope, { kind: 'member' }>
    if (kind === 'project') selected.project = { ...selected.project, id: 'p2' }
    if (kind === 'version') selected.versionId = 'v2'
    if (kind === 'revision') selected.revisionId = 'r2'
    if (kind === 'actor') selected.actorId = 'another-member'
    if (kind === 'no-actor') selected.actorId = ''
    scope.value = kind === 'public' ? publicScope() : selected
    await flushPromises()
    expect(signal.aborted).toBe(true)
    expect(state.filter.value).toBe('')
    expect(state.assignment.value).toBe('')
    delayed.resolve(pager([row('late-member')]))
    await flushPromises()
    expect(state.rows.value.map((item) => item.pageId)).not.toContain('late-member')
    if (kind === 'public') {
      state.changeAssignment('unassigned')
      await state.load()
      expect(state.assignment.value).toBe('')
      expect(vi.mocked(publicReviewThreadsApi.overview).mock.calls.at(-1)![1]).not.toHaveProperty(
        'assignment',
      )
    }
  },
)

it('aborts an older filter query without letting its rows overwrite a newer responsibility selection', async () => {
  const { state } = setup(memberScope())
  await flushPromises()
  const delayed = deferred<ReturnType<typeof pager>>()
  vi.mocked(reviewThreadsApi.overview).mockReturnValueOnce(delayed.promise)
  state.changeAssignment('mine')
  const signal = vi.mocked(reviewThreadsApi.overview).mock.calls.at(-1)![2]!.signal!
  vi.mocked(reviewThreadsApi.overview).mockResolvedValueOnce(pager([row('unassigned')]))
  state.changeAssignment('unassigned')
  await flushPromises()
  delayed.resolve(pager([row('stale-mine')]))
  await flushPromises()
  expect(signal.aborted).toBe(true)
  expect(state.rows.value.map((item) => item.pageId)).toEqual(['unassigned'])
  const calls = vi.mocked(reviewThreadsApi.overview).mock.calls.length
  state.changeAssignment('other' as 'mine')
  expect(reviewThreadsApi.overview).toHaveBeenCalledTimes(calls)
})

it('never sends or displays member responsibility filters in a public overview', async () => {
  const { state } = setup()
  await flushPromises()
  state.changeAssignment('mine')
  state.changeFilter('resolved')
  await flushPromises()
  expect(state.assignment.value).toBe('')
  expect(vi.mocked(publicReviewThreadsApi.overview).mock.calls.at(-1)![1]).toEqual({
    revisionId: 'r1',
    pageIndex: 0,
    pageSize: 20,
    state: 'resolved',
  })
  const wrapper = mount(ReviewThreadsOverviewDrawer, {
    props: { open: true, state },
    global: { plugins: [i18n], stubs: { ADrawer: { template: '<div><slot /></div>' } } },
  })
  wrappers.push(wrapper)
  expect(wrapper.find('.overview-assignment').exists()).toBe(false)
})

it('retains filter and page through session expiry and same-actor OTP, but never keeps another actor list', async () => {
  const { state, identity } = setup()
  await flushPromises()
  state.changeFilter('open')
  state.page(3)
  await flushPromises()
  identity.value = { ...context(), session: null }
  await flushPromises()
  expect(state.rows.value).toEqual([])
  const calls = vi.mocked(publicReviewThreadsApi.overview).mock.calls.length
  await state.load()
  expect(publicReviewThreadsApi.overview).toHaveBeenCalledTimes(calls)
  identity.value = { ...context(), csrfToken: 'rotated' }
  await flushPromises()
  expect(publicReviewThreadsApi.overview).toHaveBeenLastCalledWith(
    expect.anything(),
    { revisionId: 'r1', pageIndex: 2, pageSize: 20, state: 'open' },
    'rotated',
    expect.anything(),
  )
  identity.value = { ...context(), session: { ...context().session!, guestId: 'g2' } }
  await flushPromises()
  expect(state.filter.value).toBe('')
  expect(state.pageIndex.value).toBe(0)
})

it('offers identity verification when the same session passes its deadline before an explicit refresh', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    const { state, identity } = setup()
    await flushPromises()
    state.changeFilter('resolved')
    state.page(2)
    await flushPromises()
    const sameContext = identity.value
    expect(state.readable.value).toBe(true)
    expect(state.authenticationRequired.value).toBe(false)
    const calls = vi.mocked(publicReviewThreadsApi.overview).mock.calls.length
    vi.setSystemTime(sameContext!.session!.expiresAt + 1)
    await state.load()
    expect(identity.value).toBe(sameContext)
    expect(publicReviewThreadsApi.overview).toHaveBeenCalledTimes(calls)
    expect(state.rows.value).toEqual([])
    expect(state.readable.value).toBe(false)
    expect(state.authenticationRequired.value).toBe(true)
    expect(state.filter.value).toBe('resolved')
    expect(state.pageIndex.value).toBe(1)
    identity.value = { ...context(), csrfToken: 'verified-again' }
    await flushPromises()
    expect(state.authenticationRequired.value).toBe(false)
    expect(publicReviewThreadsApi.overview).toHaveBeenLastCalledWith(
      expect.anything(),
      { revisionId: 'r1', pageIndex: 1, pageSize: 20, state: 'resolved' },
      'verified-again',
      expect.anything(),
    )
  } finally {
    vi.useRealTimers()
  }
})

it.each(['scope', 'actor', 'close', 'dispose'] as const)(
  'aborts %s and rejects its late result',
  async (kind) => {
    const delayed = deferred<ReturnType<typeof pager>>()
    vi.mocked(publicReviewThreadsApi.overview).mockReturnValueOnce(delayed.promise)
    const { scope, identity, open, state } = setup()
    const signal = vi.mocked(publicReviewThreadsApi.overview).mock.calls[0]![3]!
    if (kind === 'scope') scope.value = { ...publicScope(), revisionId: 'r2' }
    if (kind === 'actor') identity.value = { ...context(), session: null }
    if (kind === 'close') open.value = false
    if (kind === 'dispose') wrappers.at(-1)!.unmount()
    await flushPromises()
    expect(signal.aborted).toBe(true)
    delayed.resolve(pager([row('late')]))
    await flushPromises()
    expect(state.rows.value).toEqual([])
  },
)

it('requires explicit authentication on server session loss and preserves the query for verification return', async () => {
  const { state, identity } = setup()
  await flushPromises()
  vi.mocked(publicReviewThreadsApi.overview).mockRejectedValueOnce(
    new ApiError('lost', 403, 'PROTOTYPE_HUB_REVIEW_SESSION_REQUIRED'),
  )
  state.page(2)
  await flushPromises()
  expect(state.authenticationRequired.value).toBe(true)
  expect(state.rows.value).toEqual([])
  expect(state.pageIndex.value).toBe(1)
  identity.value = { ...context(), csrfToken: 'new' }
  await flushPromises()
  expect(state.readable.value).toBe(true)
  expect(state.pageIndex.value).toBe(1)
})

it.each([403, 404, 500] as const)(
  'clears stale rows on %s and only retries when requested',
  async (status) => {
    const { state } = setup()
    await flushPromises()
    vi.mocked(publicReviewThreadsApi.overview).mockRejectedValueOnce(
      new ApiError('failure', status),
    )
    await state.load()
    expect(state.rows.value).toEqual([])
    expect(state.total.value).toBe(0)
    expect(state.error.value).toBe(protoLocales.zh.feedbackUnavailable)
    const calls = vi.mocked(publicReviewThreadsApi.overview).mock.calls.length
    await flushPromises()
    expect(publicReviewThreadsApi.overview).toHaveBeenCalledTimes(calls)
    await state.load()
    expect(state.rows.value).toHaveLength(1)
  },
)

it('rejects a response for a different fixed revision and ignores unsupported filter/page actions', async () => {
  vi.mocked(publicReviewThreadsApi.overview).mockResolvedValueOnce(
    pager([{ ...row(), revisionId: 'other' }]),
  )
  const { state } = setup()
  await flushPromises()
  expect(state.rows.value).toEqual([])
  expect(state.error.value).toBe(protoLocales.zh.feedbackUnavailable)
  const calls = vi.mocked(publicReviewThreadsApi.overview).mock.calls.length
  state.page(0)
  state.page(10002)
  state.page(1.5)
  state.changeFilter('bad' as 'open')
  expect(publicReviewThreadsApi.overview).toHaveBeenCalledTimes(calls)
})

it.each(['zh', 'en'] as const)(
  'renders escaped read-only %s rows and requires an explicit discard before viewing another target',
  async (locale) => {
    i18n.global.locale.value = locale
    const { state } = setup(memberScope())
    await flushPromises()
    const wrapper = mount(ReviewThreadsOverviewDrawer, {
      props: { open: true, state, guarded: true },
      global: {
        plugins: [i18n],
        stubs: {
          ADrawer: { template: '<div><slot /></div>' },
          AModal: { props: ['open'], template: '<section v-if="open"><slot /></section>' },
        },
      },
    })
    wrappers.push(wrapper)
    expect(wrapper.text()).toContain('<script>Page</script>')
    expect(wrapper.text()).toContain('<img src=x>Question')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('textarea').exists()).toBe(false)
    const assignment = wrapper.find('.overview-assignment')
    expect(assignment.text()).toContain(protoLocales[locale].overviewAssignmentAll)
    expect(assignment.text()).toContain(protoLocales[locale].overviewAssignmentMine)
    expect(assignment.text()).toContain(protoLocales[locale].overviewAssignmentUnassigned)
    await assignment.find('input[value="mine"]').setValue(true)
    await flushPromises()
    expect(state.assignment.value).toBe('mine')
    const button = (text: string) =>
      wrapper
        .findAll('button')
        .find((item) => item.text().replace(/\s/g, '') === text.replace(/\s/g, ''))!
    await button(protoLocales[locale].overviewView).trigger('click')
    expect(wrapper.emitted('view')).toBeUndefined()
    await button(i18n.global.t('common.cancel')).trigger('click')
    expect(wrapper.emitted('view')).toBeUndefined()
    await button(protoLocales[locale].overviewView).trigger('click')
    await button(protoLocales[locale].overviewLeaveConfirm).trigger('click')
    expect(wrapper.emitted('view')).toEqual([[row()]])
    await wrapper.setProps({ currentThreadId: row().id })
    await button(protoLocales[locale].overviewView).trigger('click')
    expect(wrapper.emitted('view')).toHaveLength(2)
  },
)
