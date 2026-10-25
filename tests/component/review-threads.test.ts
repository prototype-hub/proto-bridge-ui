import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import {
  useReviewThreads,
  type ReviewThreadScope,
} from '@/modules/protohub-manager-ui/hooks/useReviewThreads'
import ReviewThreadsDrawer from '@/modules/protohub-manager-ui/components/ReviewThreadsDrawer.vue'
import {
  publicReviewThreadsApi,
  reviewThreadsApi,
} from '@/modules/protohub-manager-ui/api/review-thread'
import type {
  ReviewThread,
  ReviewContext,
  ReviewMessage,
  Project,
} from '@/modules/protohub-manager-ui/types'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { permissionKey } from '@/shared/auth/provider'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { hookHarness } from '../fixtures/hook-harness'
import { ownerProjectAccess } from '../fixtures/project-access'
vi.mock('@/modules/protohub-manager-ui/api/review-thread', () => ({
  publicReviewThreadsApi: {
    query: vi.fn(),
    create: vi.fn(),
    messages: vi.fn(),
    reply: vi.fn(),
    status: vi.fn(),
  },
  reviewThreadsApi: { query: vi.fn(), messages: vi.fn(), reply: vi.fn(), status: vi.fn() },
}))
const page = { revisionId: 'r1', pageId: 'page', name: 'Page', path: 'index.html' }
const publicScope = (): ReviewThreadScope => ({
  kind: 'public',
  page: { ...page },
  share: {
    token: 'open',
    revisionId: 'r1',
    revisionMode: 'fixed',
    accessKey: 'grant',
    projectName: 'Project',
    versionName: 'Version',
    passwordRequired: false,
    reviewEnabled: true,
  },
  pendingInvitation: false,
})
const project: Project = {
  id: 'p1',
  name: 'Project',
  createdBy: 'owner',
  createdAt: 1,
  updatedAt: 1,
  ...ownerProjectAccess,
}
const memberScope = (): ReviewThreadScope => ({
  kind: 'member',
  page: { ...page },
  versionId: 'v1',
  project: structuredClone(project),
  actorId: 'member',
})
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
const thread = (): ReviewThread => ({
  id: 't1',
  revisionId: 'r1',
  pageId: 'page',
  pageName: 'Page',
  pagePath: 'index.html',
  summary: 'First text',
  authorName: 'Visitor',
  authorCompany: null,
  verificationLevel: 'email',
  state: 'open',
  configVersion: 2,
  createdAt: 1,
  updatedAt: 2,
})
const message = (): ReviewMessage => ({
  id: 'm1',
  threadId: 't1',
  text: 'First text',
  authorType: 'guest',
  authorName: 'Visitor',
  authorCompany: null,
  verificationLevel: 'email',
  visibility: 'public',
  createdAt: 1,
})
const pager = <T>(data: T[], total = data.length) => ({ data, total, pageIndex: 0, pageSize: 20 })
const wrappers: VueWrapper[] = []
function setup(value: ReviewThreadScope | null = publicScope(), active = true) {
  const target = ref<ReviewThreadScope | undefined>(value ?? undefined),
    open = ref(active),
    identity = shallowRef<ReviewContext | undefined>(context()),
    grants = ref([p.version.query, p.version.save] as string[])
  let state!: ReturnType<typeof useReviewThreads>
  const wrapper = mount(
    hookHarness(() => {
      state = useReviewThreads(target, open, identity)
    }),
    {
      global: {
        provide: { [permissionKey]: { can: (key: string) => grants.value.includes(key) } },
      },
    },
  )
  wrappers.push(wrapper)
  return { state, target, open, identity, grants }
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
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  for (const api of [publicReviewThreadsApi, reviewThreadsApi]) {
    vi.mocked(api.query)
      .mockReset()
      .mockImplementation(async () => pager([thread()]))
    vi.mocked(api.messages)
      .mockReset()
      .mockImplementation(async () => pager([message()]))
    vi.mocked(api.reply).mockReset().mockResolvedValue(message())
    vi.mocked(api.status).mockReset().mockResolvedValue(thread())
  }
  vi.mocked(publicReviewThreadsApi.create).mockReset().mockResolvedValue(thread())
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})
it('requires valid visitor identity, effective opt-in and an explicitly completed or abandoned invitation', async () => {
  const { state, target, identity } = setup(null)
  await flushPromises()
  expect(publicReviewThreadsApi.query).not.toHaveBeenCalled()
  target.value = publicScope()
  identity.value = { ...context(), session: null }
  await flushPromises()
  expect(state.authenticationRequired.value).toBe(true)
  state.text.value = 'Draft'
  await state.send()
  expect(publicReviewThreadsApi.create).not.toHaveBeenCalled()
  identity.value = { ...context(), allowComment: undefined }
  await flushPromises()
  expect(state.readable.value).toBe(false)
  expect(state.text.value).toBe('')
  target.value = { ...publicScope(), pendingInvitation: true } as ReviewThreadScope
  identity.value = context()
  await flushPromises()
  expect(state.readable.value).toBe(false)
  target.value = publicScope()
  await flushPromises()
  expect(state.readable.value).toBe(true)
})
it('intersects PM project EDIT and ordinary query/save, never creates a PM top-level thread', async () => {
  const { state, target, grants } = setup(memberScope())
  await flushPromises()
  state.text.value = 'No top-level'
  await state.send()
  expect(reviewThreadsApi.reply).not.toHaveBeenCalled()
  state.choose(state.threads.value[0])
  await flushPromises()
  state.text.value = 'Internal'
  state.visibility.value = 'internal'
  grants.value = [p.version.query]
  await state.send()
  expect(reviewThreadsApi.reply).not.toHaveBeenCalled()
  grants.value = [p.version.query, p.version.save]
  await flushPromises()
  await state.send()
  expect(reviewThreadsApi.reply).toHaveBeenCalledWith(
    'v1',
    't1',
    expect.objectContaining({ visibility: 'internal', text: 'Internal' }),
    expect.anything(),
  )
  target.value = {
    ...memberScope(),
    project: { ...project, capabilities: { ...project.capabilities, edit: false } },
  } as ReviewThreadScope
  await flushPromises()
  expect(state.readable.value).toBe(false)
  expect(state.text.value).toBe('')
})
it('preserves same-target draft through expiry, identity drawer handoff and CSRF rotation, but never submits on return', async () => {
  const { state, identity, open } = setup()
  await flushPromises()
  state.text.value = 'Keep me'
  identity.value = undefined
  await flushPromises()
  expect(state.text.value).toBe('Keep me')
  expect(state.authenticationRequired.value).toBe(true)
  open.value = false
  open.value = true
  identity.value = { ...context(), csrfToken: 'new-csrf' }
  await flushPromises()
  expect(state.text.value).toBe('Keep me')
  expect(publicReviewThreadsApi.create).not.toHaveBeenCalled()
  await state.send()
  expect(publicReviewThreadsApi.create).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ text: 'Keep me' }),
    'new-csrf',
    expect.any(AbortSignal),
  )
  expect(state.text.value).toBe('')
})
it.each(['share', 'grant', 'revision', 'page', 'identity'] as const)(
  'clears draft and request receipt on changed %s target',
  async (action) => {
    const { state, target, identity } = setup()
    await flushPromises()
    state.text.value = 'Private draft'
    const value = publicScope() as Extract<ReviewThreadScope, { kind: 'public' }>
    if (action === 'share') value.share.token = 'other'
    if (action === 'grant') value.share.accessKey = 'rotated'
    if (action === 'revision') {
      value.page.revisionId = 'r2'
      value.share.revisionId = 'r2'
    }
    if (action === 'page') value.page.pageId = 'other'
    if (action === 'identity')
      identity.value = { ...context(), session: { ...context().session!, guestId: 'other' } }
    else target.value = value
    await flushPromises()
    expect(state.text.value).toBe('')
  },
)
it('reuses the exact request key on an ambiguous manual retry, and changes it only when semantic text changes', async () => {
  const { state } = setup()
  await flushPromises()
  state.text.value = 'Retry text'
  vi.mocked(publicReviewThreadsApi.create).mockRejectedValue(new ApiError('network', 0))
  await state.send()
  const first = vi.mocked(publicReviewThreadsApi.create).mock.calls[0]![1]
  expect(state.notice.value).toBe(protoLocales.zh.feedbackResultUnknown)
  expect(state.text.value).toBe('Retry text')
  await state.load()
  await state.send()
  expect(vi.mocked(publicReviewThreadsApi.create).mock.calls[1]![1]).toEqual(first)
  state.text.value = 'Changed'
  await state.send()
  expect(vi.mocked(publicReviewThreadsApi.create).mock.calls[2]![1].clientRequestId).not.toBe(
    first.clientRequestId,
  )
})
it('uses the original CAS/key after an unknown status result even if explicit refresh sees the new version', async () => {
  const { state } = setup(memberScope())
  await flushPromises()
  state.choose(state.threads.value[0])
  await flushPromises()
  vi.mocked(reviewThreadsApi.status).mockRejectedValue(new ApiError('network', 0))
  await state.status('resolved')
  const first = vi.mocked(reviewThreadsApi.status).mock.calls[0]![2]
  vi.mocked(reviewThreadsApi.query).mockResolvedValue(
    pager([{ ...thread(), configVersion: 3, state: 'resolved' }]),
  )
  await state.load()
  await state.status('resolved')
  expect(vi.mocked(reviewThreadsApi.status).mock.calls[1]![2]).toEqual(first)
})
it('refreshes a CAS conflict without a write retry and keeps the reply draft', async () => {
  const { state } = setup(memberScope())
  await flushPromises()
  state.choose(state.threads.value[0])
  await flushPromises()
  state.text.value = 'Keep after conflict'
  vi.mocked(reviewThreadsApi.status).mockRejectedValueOnce(new ApiError('conflict', 409))
  await state.status('resolved')
  expect(reviewThreadsApi.status).toHaveBeenCalledOnce()
  expect(state.notice.value).toBe(protoLocales.zh.feedbackConflict)
  expect(state.text.value).toBe('Keep after conflict')
})
it('retains the draft for SESSION_REQUIRED but clears it for invalid share/page or comments disabled', async () => {
  const { state, identity } = setup()
  await flushPromises()
  state.text.value = 'Session draft'
  vi.mocked(publicReviewThreadsApi.create).mockRejectedValueOnce(
    new ApiError('hidden', 403, 'PROTOTYPE_HUB_REVIEW_SESSION_REQUIRED'),
  )
  await state.send()
  expect(state.text.value).toBe('Session draft')
  expect(state.authenticationRequired.value).toBe(true)
  identity.value = { ...context(), csrfToken: 'reload' }
  await flushPromises()
  vi.mocked(publicReviewThreadsApi.create).mockRejectedValueOnce(
    new ApiError('hidden', 404, 'PROTOTYPE_HUB_REVIEW_PAGE_INVALID'),
  )
  await state.send()
  expect(state.text.value).toBe('')
})
it('cannot resolve a visitor thread or render contradictory internal data in public', async () => {
  const { state } = setup()
  await flushPromises()
  state.choose(state.threads.value[0])
  await flushPromises()
  await state.status('resolved')
  expect(publicReviewThreadsApi.status).not.toHaveBeenCalled()
  vi.mocked(publicReviewThreadsApi.messages).mockResolvedValueOnce(
    pager([{ ...message(), visibility: 'internal', text: 'Secret note' }]),
  )
  await state.load()
  expect(state.messages.value).toEqual([])
  expect(state.text.value).toBe('')
  expect(state.error.value).toBe(protoLocales.zh.feedbackUnavailable)
})
it('uses separate bounded server pages and ignores late page/write results after target change', async () => {
  const { state, target } = setup()
  await flushPromises()
  const pending = deferred<ReturnType<typeof pager<ReviewThread>>>()
  vi.mocked(publicReviewThreadsApi.query).mockReturnValueOnce(pending.promise)
  const loading = state.load()
  const signal = vi.mocked(publicReviewThreadsApi.query).mock.calls.at(-1)![3]!
  target.value = undefined
  expect(signal.aborted).toBe(true)
  pending.resolve(pager([thread()], 99))
  await loading
  expect(state.threads.value).toEqual([])
  target.value = publicScope()
  await flushPromises()
  state.text.value = 'Late body'
  const result = deferred<ReviewThread>()
  vi.mocked(publicReviewThreadsApi.create).mockReturnValueOnce(result.promise)
  const writing = state.send()
  target.value = undefined
  result.resolve(thread())
  await writing
  expect(state.text.value).toBe('')
  expect(state.selected.value).toBeUndefined()
})
it('renders plain text safely, shows internal labels only in PM data, and exposes right-aligned server pagers', async () => {
  const { state } = setup(memberScope())
  await flushPromises()
  state.choose(state.threads.value[0])
  await flushPromises()
  state.messages.value = [
    {
      ...message(),
      text: '<script>alert(1)</script>',
      visibility: 'internal',
      authorType: 'member',
      verificationLevel: null,
    },
  ]
  state.messagesTotal.value = 42
  state.total.value = 41
  const wrapper = mount(ReviewThreadsDrawer, {
    props: { open: true, page, state },
    global: { plugins: [i18n], stubs: { ADrawer: { template: '<div><slot /></div>' } } },
  })
  wrappers.push(wrapper)
  expect(wrapper.find('script').exists()).toBe(false)
  expect(wrapper.text()).toContain('<script>alert(1)</script>')
  expect(wrapper.text()).toContain(protoLocales.zh.feedbackInternal)
  expect(wrapper.findAll('.feedback-pagination')).toHaveLength(2)
})

it('sends bounded independent thread/message page indices and status filters to the server', async () => {
  const { state } = setup()
  await flushPromises()
  state.page(10002)
  await flushPromises()
  expect(publicReviewThreadsApi.query).toHaveBeenLastCalledWith(
    expect.anything(),
    { revisionId: 'r1', pageId: 'page', pageIndex: 10000, pageSize: 20 },
    'csrf',
    expect.any(AbortSignal),
  )
  state.changeFilter('resolved')
  await flushPromises()
  expect(publicReviewThreadsApi.query).toHaveBeenLastCalledWith(
    expect.anything(),
    { revisionId: 'r1', pageId: 'page', pageIndex: 0, pageSize: 20, state: 'resolved' },
    'csrf',
    expect.any(AbortSignal),
  )
  state.choose(state.threads.value[0])
  await flushPromises()
  state.messagePage(3)
  await flushPromises()
  expect(publicReviewThreadsApi.messages).toHaveBeenLastCalledWith(
    expect.anything(),
    't1',
    { revisionId: 'r1', pageId: 'page', pageIndex: 2, pageSize: 20 },
    'csrf',
    expect.any(AbortSignal),
  )
})
it('checks real expiry again at the write boundary even without a view tick', async () => {
  const { state, identity } = setup()
  await flushPromises()
  state.text.value = 'Expired draft'
  vi.spyOn(Date, 'now').mockReturnValue(identity.value!.session!.expiresAt + 1)
  await state.send()
  expect(publicReviewThreadsApi.create).not.toHaveBeenCalled()
  expect(state.text.value).toBe('Expired draft')
  vi.restoreAllMocks()
})
it.each(['', '  \n\t ', '\u2003', 'x'.repeat(4001)])(
  'rejects blank or oversized text without sending (%s)',
  async (input) => {
    const { state } = setup()
    await flushPromises()
    state.text.value = input
    await state.send()
    expect(publicReviewThreadsApi.create).not.toHaveBeenCalled()
    expect(state.notice.value).toBe(protoLocales.zh.feedbackTextRequired)
  },
)

it('explains a disabled policy without sending the visitor into an unnecessary identity flow', async () => {
  const { state, identity } = setup()
  identity.value = { ...context(), session: null, allowComment: false }
  await flushPromises()
  const wrapper = mount(ReviewThreadsDrawer, {
    props: { open: true, page, state },
    global: { plugins: [i18n], stubs: { ADrawer: { template: '<div><slot /></div>' } } },
  })
  wrappers.push(wrapper)
  expect(wrapper.text()).toContain(protoLocales.zh.feedbackDisabled)
  expect(
    wrapper.findAll('button').some((button) => button.text() === protoLocales.zh.reviewIdentity),
  ).toBe(false)
})

it('uses the existing cryptographic fallback on LAN HTTP and retains its key on an explicit unknown-result retry', async () => {
  const getRandomValues = crypto.getRandomValues.bind(crypto)
  vi.stubGlobal('crypto', { randomUUID: undefined, getRandomValues })
  const { state } = setup()
  await flushPromises()
  state.text.value = 'LAN draft'
  vi.mocked(publicReviewThreadsApi.create).mockRejectedValue(new ApiError('network', 0))
  await state.send()
  const first = vi.mocked(publicReviewThreadsApi.create).mock.calls[0]![1]
  expect(first.clientRequestId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  expect(first.clientRequestId).toMatch(/^[\x21-\x7e]{1,128}$/)
  await state.send()
  expect(vi.mocked(publicReviewThreadsApi.create).mock.calls[1]![1]).toEqual(first)
})
