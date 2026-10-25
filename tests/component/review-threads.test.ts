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
    detail: vi.fn(),
    query: vi.fn(),
    create: vi.fn(),
    messages: vi.fn(),
    reply: vi.fn(),
    replyImage: vi.fn(),
    image: vi.fn(),
    status: vi.fn(),
  },
  reviewThreadsApi: {
    assignment: vi.fn(),
    assignees: vi.fn(),
    assign: vi.fn(),
    detail: vi.fn(),
    query: vi.fn(),
    messages: vi.fn(),
    reply: vi.fn(),
    replyImage: vi.fn(),
    image: vi.fn(),
    status: vi.fn(),
  },
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
  image: null,
})
const pager = <T>(data: T[], total = data.length) => ({ data, total, pageIndex: 0, pageSize: 20 })
const wrappers: VueWrapper[] = []
const OriginalURL = URL
const file = (type = 'image/png', bytes = 'png') => new File([bytes], 'private-name.png', { type })
function setup(
  value: ReviewThreadScope | null = publicScope(),
  active = true,
  requested?: string | null,
) {
  const target = ref<ReviewThreadScope | undefined>(value ?? undefined),
    open = ref(active),
    identity = shallowRef<ReviewContext | undefined>(context()),
    grants = ref([p.version.query, p.version.save] as string[]),
    threadId = ref(requested)
  let state!: ReturnType<typeof useReviewThreads>
  const wrapper = mount(
    hookHarness(() => {
      state = useReviewThreads(
        target,
        open,
        identity,
        requested === undefined
          ? undefined
          : {
              threadId,
              select: (thread) => {
                threadId.value = thread?.id
              },
            },
      )
    }),
    {
      global: {
        provide: { [permissionKey]: { can: (key: string) => grants.value.includes(key) } },
      },
    },
  )
  wrappers.push(wrapper)
  return { state, target, open, identity, grants, threadId }
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
  let sequence = 0
  vi.stubGlobal(
    'URL',
    class extends OriginalURL {
      static createObjectURL = vi.fn(() => `blob:test-${++sequence}`)
      static revokeObjectURL = vi.fn()
    },
  )
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  for (const api of [publicReviewThreadsApi, reviewThreadsApi]) {
    vi.mocked(api.detail)
      .mockReset()
      .mockImplementation(async () => thread())
    vi.mocked(api.query)
      .mockReset()
      .mockImplementation(async () => pager([thread()]))
    vi.mocked(api.messages)
      .mockReset()
      .mockImplementation(async () => pager([message()]))
    vi.mocked(api.reply).mockReset().mockResolvedValue(message())
    vi.mocked(api.replyImage).mockReset().mockResolvedValue(message())
    vi.mocked(api.image)
      .mockReset()
      .mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    vi.mocked(api.status).mockReset().mockResolvedValue(thread())
  }
  vi.mocked(publicReviewThreadsApi.create).mockReset().mockResolvedValue(thread())
  vi.mocked(reviewThreadsApi.assignment)
    .mockReset()
    .mockImplementation(async (_version, id) => ({
      threadId: id,
      assignmentVersion: 0,
      updatedAt: null,
      assignee: null,
    }))
  vi.mocked(reviewThreadsApi.assignees).mockReset().mockResolvedValue(pager([]))
  vi.mocked(reviewThreadsApi.assign).mockReset()
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

it('keeps a direct detail outside the paged/filtered list without changing server totals or losing its reply draft', async () => {
  const id = 'a'.repeat(43)
  vi.mocked(publicReviewThreadsApi.query).mockResolvedValue(pager([], 42))
  vi.mocked(publicReviewThreadsApi.detail).mockResolvedValue({ ...thread(), id })
  vi.mocked(publicReviewThreadsApi.messages).mockResolvedValue(
    pager([{ ...message(), threadId: id }]),
  )
  const { state } = setup(publicScope(), true, id)
  await flushPromises()
  expect(state.selected.value?.id).toBe(id)
  expect(state.threads.value).toEqual([])
  expect(state.total.value).toBe(42)
  state.text.value = 'Same-target reply'
  state.page(2)
  await flushPromises()
  state.changeFilter('resolved')
  await flushPromises()
  expect(state.selected.value).toMatchObject({ id, state: 'open' })
  expect(state.text.value).toBe('Same-target reply')
  expect(state.total.value).toBe(42)
  expect(publicReviewThreadsApi.query).toHaveBeenLastCalledWith(
    expect.anything(),
    { revisionId: 'r1', pageId: 'page', pageIndex: 0, pageSize: 20, state: 'resolved' },
    'csrf',
    expect.any(AbortSignal),
  )
  expect(publicReviewThreadsApi.detail).toHaveBeenLastCalledWith(
    expect.anything(),
    id,
    { revisionId: 'r1', pageId: 'page' },
    'csrf',
    expect.any(AbortSignal),
  )
})

it('does not look up a target before identity/invitation completion and resumes the same target only afterwards', async () => {
  const id = 'a'.repeat(43)
  vi.mocked(publicReviewThreadsApi.detail).mockResolvedValue({ ...thread(), id })
  vi.mocked(publicReviewThreadsApi.messages).mockResolvedValue(pager([]))
  const value = publicScope() as Extract<ReviewThreadScope, { kind: 'public' }>
  value.pendingInvitation = true
  const { state, identity, target } = setup(value, true, id)
  identity.value = { ...context(), session: null }
  await flushPromises()
  expect(publicReviewThreadsApi.detail).not.toHaveBeenCalled()
  expect(publicReviewThreadsApi.messages).not.toHaveBeenCalled()
  identity.value = context()
  await flushPromises()
  expect(publicReviewThreadsApi.detail).not.toHaveBeenCalled()
  target.value = publicScope()
  await flushPromises()
  expect(state.selected.value?.id).toBe(id)
  expect(publicReviewThreadsApi.create).not.toHaveBeenCalled()
})

it('never queries a PM detail when project EDIT or version query permission is absent', async () => {
  const { state, grants, target, open } = setup(memberScope(), false, 'a'.repeat(43))
  grants.value = []
  open.value = true
  await flushPromises()
  state.text.value = 'Not authorized'
  expect(reviewThreadsApi.detail).not.toHaveBeenCalled()
  expect(reviewThreadsApi.messages).not.toHaveBeenCalled()
  target.value = {
    ...memberScope(),
    project: { ...project, capabilities: { ...project.capabilities, edit: false } },
  } as ReviewThreadScope
  grants.value = [p.version.query]
  await state.load()
  expect(reviewThreadsApi.detail).not.toHaveBeenCalled()
})

it('keeps malformed or missing deep targets in an error state, never silently enabling top-level creation', async () => {
  const { state, threadId } = setup(publicScope(), true, null)
  await flushPromises()
  expect(state.error.value).toBe(protoLocales.zh.feedbackInvalidTarget)
  expect(publicReviewThreadsApi.query).not.toHaveBeenCalled()
  expect(publicReviewThreadsApi.detail).not.toHaveBeenCalled()
  state.text.value = 'Must not create'
  await state.send()
  expect(publicReviewThreadsApi.create).not.toHaveBeenCalled()
  threadId.value = 'a'.repeat(43)
  vi.mocked(publicReviewThreadsApi.detail).mockRejectedValue(new ApiError('hidden', 404))
  await state.load()
  expect(state.selected.value).toBeUndefined()
  expect(state.selectedId.value).toBe(threadId.value)
  expect(state.writable.value).toBe(false)
  await state.send()
  expect(publicReviewThreadsApi.create).not.toHaveBeenCalled()
  expect(publicReviewThreadsApi.messages).not.toHaveBeenCalled()
})

it.each(['id', 'revisionId', 'pageId'] as const)(
  'rejects contradictory detail %s before messages/render/send',
  async (key) => {
    const id = 'a'.repeat(43)
    vi.mocked(publicReviewThreadsApi.detail).mockResolvedValue({
      ...thread(),
      id,
      [key]: 'foreign',
    })
    const { state } = setup(publicScope(), true, id)
    await flushPromises()
    expect(state.selected.value).toBeUndefined()
    expect(state.messages.value).toEqual([])
    expect(state.writable.value).toBe(false)
    expect(publicReviewThreadsApi.messages).not.toHaveBeenCalled()
    await state.send()
    expect(publicReviewThreadsApi.create).not.toHaveBeenCalled()
  },
)

it('preserves a direct-target reply through SESSION_REQUIRED and CSRF reauthentication without automatic submission', async () => {
  const id = 'a'.repeat(43)
  vi.mocked(publicReviewThreadsApi.detail).mockResolvedValue({ ...thread(), id })
  vi.mocked(publicReviewThreadsApi.messages).mockResolvedValue(pager([]))
  const { state, identity, open } = setup(publicScope(), true, id)
  await flushPromises()
  state.text.value = 'Keep target draft'
  vi.mocked(publicReviewThreadsApi.detail).mockRejectedValueOnce(
    new ApiError('hidden', 403, 'PROTOTYPE_HUB_REVIEW_SESSION_REQUIRED'),
  )
  await state.load()
  expect(state.authenticationRequired.value).toBe(true)
  expect(state.text.value).toBe('Keep target draft')
  open.value = false
  identity.value = { ...context(), csrfToken: 'fresh' }
  open.value = true
  await flushPromises()
  expect(state.selected.value?.id).toBe(id)
  expect(state.text.value).toBe('Keep target draft')
  expect(publicReviewThreadsApi.reply).not.toHaveBeenCalled()
})

it.each(['target', 'actor', 'scope', 'close'] as const)(
  'aborts late direct details on changed %s without installing old data',
  async (change) => {
    const id = 'a'.repeat(43)
    const pending = deferred<ReviewThread>()
    vi.mocked(publicReviewThreadsApi.detail).mockReturnValueOnce(pending.promise)
    const { state, threadId, identity, target, open } = setup(publicScope(), true, id)
    await flushPromises()
    const signal = vi.mocked(publicReviewThreadsApi.detail).mock.calls[0]![4]!
    state.text.value = 'Old target draft'
    if (change === 'target') threadId.value = 'b'.repeat(43)
    if (change === 'actor')
      identity.value = { ...context(), session: { ...context().session!, guestId: 'other' } }
    if (change === 'scope') target.value = undefined
    if (change === 'close') open.value = false
    expect(signal.aborted).toBe(true)
    pending.resolve({ ...thread(), id, summary: 'Late old detail' })
    await flushPromises()
    expect(state.selected.value?.summary).not.toBe('Late old detail')
    expect(state.messages.value).toEqual([])
    if (change !== 'close') expect(state.text.value).toBe('')
  },
)

it('only selects one hinted PNG/JPEG for an existing thread and uploads nothing until a text reply is sent', async () => {
  const { state } = setup()
  await flushPromises()
  state.selectImage(file())
  expect(state.imageFile.value).toBeUndefined()
  expect(state.notice.value).toBe(protoLocales.zh.feedbackImageThreadRequired)
  state.choose(state.threads.value[0])
  await flushPromises()
  for (const invalid of [
    file('image/svg+xml'),
    file('image/png', ''),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
  ]) {
    state.selectImage(invalid)
    expect(state.imageFile.value).toBeUndefined()
    expect(state.notice.value).toBe(protoLocales.zh.feedbackImageInvalid)
  }
  const selected = file()
  state.selectImage(selected)
  expect(state.imageFile.value).toBe(selected)
  expect(state.imagePreview.value).toBe('blob:test-1')
  expect(publicReviewThreadsApi.replyImage).not.toHaveBeenCalled()
  await state.send()
  expect(publicReviewThreadsApi.replyImage).not.toHaveBeenCalled()
  expect(state.notice.value).toBe(protoLocales.zh.feedbackTextRequired)
  state.text.value = 'Screenshot context'
  await state.send()
  expect(publicReviewThreadsApi.replyImage).toHaveBeenCalledWith(
    expect.anything(),
    't1',
    expect.objectContaining({ text: 'Screenshot context' }),
    selected,
    'csrf',
    expect.any(AbortSignal),
  )
  expect(publicReviewThreadsApi.reply).not.toHaveBeenCalled()
  expect(state.imageFile.value).toBeUndefined()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1')
})

it('keeps the same File and key on unknown manual retry, and changes the key for replaced bytes or text-only replies', async () => {
  const { state } = setup()
  await flushPromises()
  state.choose(state.threads.value[0])
  await flushPromises()
  state.text.value = 'Caption'
  const original = file()
  state.selectImage(original)
  vi.mocked(publicReviewThreadsApi.replyImage).mockRejectedValue(new ApiError('network', 0))
  await state.send()
  const first = vi.mocked(publicReviewThreadsApi.replyImage).mock.calls[0]![2]
  await state.load()
  await state.send()
  expect(vi.mocked(publicReviewThreadsApi.replyImage).mock.calls[1]![2]).toEqual(first)
  expect(vi.mocked(publicReviewThreadsApi.replyImage).mock.calls[1]![3]).toBe(original)
  state.selectImage(file('image/png', 'different bytes'))
  await state.send()
  expect(vi.mocked(publicReviewThreadsApi.replyImage).mock.calls[2]![2].clientRequestId).not.toBe(
    first.clientRequestId,
  )
  state.selectImage()
  await state.send()
  expect(vi.mocked(publicReviewThreadsApi.reply).mock.calls[0]![2].clientRequestId).not.toBe(
    first.clientRequestId,
  )
})

it('preserves the local File through same-actor expiry/OTP handoff without upload and revokes its preview while hidden', async () => {
  const { state, identity, open } = setup(publicScope(), true, 't1')
  await flushPromises()
  const selected = file()
  state.text.value = 'OTP caption'
  state.selectImage(selected)
  identity.value = { ...context(), session: null }
  open.value = false
  await flushPromises()
  expect(state.imageFile.value).toBe(selected)
  expect(state.imagePreview.value).toBe('')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1')
  open.value = true
  identity.value = { ...context(), csrfToken: 'new-csrf' }
  await flushPromises()
  expect(state.imageFile.value).toBe(selected)
  expect(publicReviewThreadsApi.replyImage).not.toHaveBeenCalled()
  await state.send()
  expect(publicReviewThreadsApi.replyImage).toHaveBeenCalledWith(
    expect.anything(),
    't1',
    expect.objectContaining({ text: 'OTP caption' }),
    selected,
    'new-csrf',
    expect.any(AbortSignal),
  )
})

it.each(['scope', 'actor', 'thread'] as const)(
  'clears File and revokes Blob previews when %s changes',
  async (kind) => {
    const { state, target, identity, threadId } = setup(publicScope(), true, 't1')
    await flushPromises()
    state.text.value = 'Private caption'
    state.selectImage(file())
    if (kind === 'scope') target.value = undefined
    else if (kind === 'actor')
      identity.value = { ...context(), session: { ...context().session!, guestId: 'other' } }
    else threadId.value = 'other'
    await flushPromises()
    expect(state.imageFile.value).toBeUndefined()
    expect(state.imagePreview.value).toBe('')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1')
    expect(publicReviewThreadsApi.replyImage).not.toHaveBeenCalled()
  },
)

it('keeps image validation failures and 409 conflicts as explicit manual actions while retaining the draft', async () => {
  const { state } = setup()
  await flushPromises()
  state.choose(state.threads.value[0])
  await flushPromises()
  const selected = file()
  state.selectImage(selected)
  state.text.value = 'Caption'
  vi.mocked(publicReviewThreadsApi.replyImage).mockRejectedValueOnce(
    new ApiError('invalid', 400, 'PROTOTYPE_HUB_REVIEW_IMAGE_INVALID'),
  )
  await state.send()
  expect(state.notice.value).toBe(protoLocales.zh.feedbackImageInvalid)
  expect(state.imageFile.value).toBe(selected)
  vi.mocked(publicReviewThreadsApi.replyImage).mockRejectedValueOnce(new ApiError('changed', 409))
  await state.send()
  expect(publicReviewThreadsApi.replyImage).toHaveBeenCalledTimes(2)
  expect(state.imageFile.value).toBe(selected)
  expect(state.text.value).toBe('Caption')
  expect(state.notice.value).toBe(protoLocales.zh.feedbackConflict)
})

it('PM image replies use the same explicit visibility and query/save project intersection', async () => {
  const { state, grants } = setup(memberScope())
  await flushPromises()
  state.choose(state.threads.value[0])
  await flushPromises()
  const selected = file('image/jpeg', 'jpeg')
  state.selectImage(selected)
  state.text.value = 'Private caption'
  state.visibility.value = 'internal'
  grants.value = [p.version.query]
  await flushPromises()
  await state.send()
  expect(reviewThreadsApi.replyImage).not.toHaveBeenCalled()
  grants.value = [p.version.query, p.version.save]
  await flushPromises()
  await state.send()
  expect(reviewThreadsApi.replyImage).toHaveBeenCalledWith(
    'v1',
    't1',
    expect.objectContaining({ visibility: 'internal', text: 'Private caption' }),
    selected,
    expect.objectContaining({ silent: true }),
  )
})

it('fetches image content only on explicit view and revokes it on replacement, hide and unmount', async () => {
  const { state } = setup()
  await flushPromises()
  state.choose(state.threads.value[0])
  await flushPromises()
  const row = {
    ...message(),
    image: { contentType: 'image/png' as const, size: 3, width: 1, height: 1 },
  }
  state.messages.value = [row]
  expect(publicReviewThreadsApi.image).not.toHaveBeenCalled()
  await state.viewImage(row)
  expect(publicReviewThreadsApi.image).toHaveBeenCalledWith(
    expect.anything(),
    't1',
    'm1',
    { revisionId: 'r1', pageId: 'page' },
    'csrf',
    expect.any(AbortSignal),
  )
  expect(state.imageView.value?.url).toBe('blob:test-1')
  await state.viewImage(row)
  expect(state.imageView.value).toBeUndefined()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1')
  await state.viewImage(row)
  state.selectImage(file())
  wrappers[0]!.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-2')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-3')
})

it('rejects contradictory MIME/metadata and missing content without replacing the thread or showing an image', async () => {
  const { state } = setup()
  await flushPromises()
  state.choose(state.threads.value[0])
  await flushPromises()
  const row = {
    ...message(),
    image: { contentType: 'image/png' as const, size: 3, width: 1, height: 1 },
  }
  state.messages.value = [row]
  vi.mocked(publicReviewThreadsApi.image).mockResolvedValueOnce(
    new Blob(['svg'], { type: 'image/svg+xml' }),
  )
  await state.viewImage(row)
  expect(state.imageView.value?.error).toBe(protoLocales.zh.feedbackImageUnavailable)
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  vi.mocked(publicReviewThreadsApi.image).mockRejectedValueOnce(
    new ApiError('missing', 404, 'PROTOTYPE_HUB_REVIEW_IMAGE_UNAVAILABLE'),
  )
  await state.viewImage(row)
  expect(state.imageView.value?.error).toBe(protoLocales.zh.feedbackImageUnavailable)
  expect(state.selected.value?.id).toBe('t1')
})

it.each(['actor', 'scope', 'close'] as const)(
  'aborts an image read on %s and never installs late bytes',
  async (change) => {
    const { state, open, target, identity } = setup()
    await flushPromises()
    state.choose(state.threads.value[0])
    await flushPromises()
    const row = {
      ...message(),
      image: { contentType: 'image/png' as const, size: 3, width: 1, height: 1 },
    }
    state.messages.value = [row]
    const pending = deferred<Blob>()
    vi.mocked(publicReviewThreadsApi.image).mockReturnValueOnce(pending.promise)
    const viewing = state.viewImage(row)
    const signal = vi.mocked(publicReviewThreadsApi.image).mock.calls[0]![5]!
    if (change === 'close') open.value = false
    else if (change === 'scope') target.value = undefined
    else identity.value = { ...context(), session: { ...context().session!, guestId: 'other' } }
    expect(signal.aborted).toBe(true)
    pending.resolve(new Blob(['png'], { type: 'image/png' }))
    await viewing
    expect(state.imageView.value).toBeUndefined()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  },
)

it('renders labelled selection, a removable local preview and explicit saved-image viewing without exposing the filename', async () => {
  const { state } = setup()
  await flushPromises()
  state.choose(state.threads.value[0])
  await flushPromises()
  const row = {
    ...message(),
    image: { contentType: 'image/png' as const, size: 3, width: 1, height: 1 },
  }
  state.messages.value = [row]
  const wrapper = mount(ReviewThreadsDrawer, {
    props: { open: true, page, state },
    global: { plugins: [i18n], stubs: { ADrawer: { template: '<div><slot /></div>' } } },
  })
  wrappers.push(wrapper)
  const input = wrapper.get<HTMLInputElement>('#review-feedback-image')
  expect(wrapper.get('label[for="review-feedback-image"]').text()).toBe(
    protoLocales.zh.feedbackImageSelect,
  )
  expect(input.attributes('accept')).toBe('image/png,image/jpeg')
  const selected = file()
  Object.defineProperty(input.element, 'files', { value: [selected] })
  await input.trigger('change')
  expect(state.imageFile.value).toBe(selected)
  expect(
    wrapper.get(`img[alt="${protoLocales.zh.feedbackImageDraftAlt}"]`).attributes('src'),
  ).toMatch(/^blob:/)
  expect(wrapper.text()).not.toContain(selected.name)
  expect(publicReviewThreadsApi.replyImage).not.toHaveBeenCalled()
  expect(publicReviewThreadsApi.image).not.toHaveBeenCalled()
  const remove = wrapper
    .findAll('button')
    .find((button) => button.text() === protoLocales.zh.feedbackImageRemove)!
  await remove.trigger('click')
  expect(wrapper.find(`img[alt="${protoLocales.zh.feedbackImageDraftAlt}"]`).exists()).toBe(false)
  expect(URL.revokeObjectURL).toHaveBeenCalled()
  const view = wrapper
    .findAll('button')
    .find((button) => button.text() === protoLocales.zh.feedbackImageView)!
  await view.trigger('click')
  await flushPromises()
  expect(publicReviewThreadsApi.image).toHaveBeenCalledTimes(1)
  expect(wrapper.get(`img[alt="${protoLocales.zh.feedbackImageAlt}"]`).attributes('src')).toMatch(
    /^blob:/,
  )
  await wrapper.get(`img[alt="${protoLocales.zh.feedbackImageAlt}"]`).trigger('error')
  expect(wrapper.text()).toContain(protoLocales.zh.feedbackImageUnavailable)
  expect(wrapper.find(`img[alt="${protoLocales.zh.feedbackImageAlt}"]`).exists()).toBe(false)
})
