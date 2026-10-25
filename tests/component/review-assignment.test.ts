import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref, computed, shallowRef } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { hookHarness } from '../fixtures/hook-harness'
import { ownerProjectAccess } from '../fixtures/project-access'
import { useReviewAssignment } from '@/modules/protohub-manager-ui/hooks/useReviewAssignment'
import {
  useReviewThreads,
  type ReviewThreadScope,
} from '@/modules/protohub-manager-ui/hooks/useReviewThreads'
import {
  reviewThreadsApi,
  publicReviewThreadsApi,
} from '@/modules/protohub-manager-ui/api/review-thread'
import ReviewThreadsDrawer from '@/modules/protohub-manager-ui/components/ReviewThreadsDrawer.vue'
import type {
  ReviewAssignment,
  ReviewContext,
  ReviewThread,
} from '@/modules/protohub-manager-ui/types'
import { permissionKey } from '@/shared/auth/provider'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'

vi.mock('@/modules/protohub-manager-ui/api/review-thread', () => ({
  reviewThreadsApi: {
    assignment: vi.fn(),
    assignees: vi.fn(),
    assign: vi.fn(),
    query: vi.fn(),
    detail: vi.fn(),
    messages: vi.fn(),
    replyImage: vi.fn(),
    status: vi.fn(),
  },
  publicReviewThreadsApi: { query: vi.fn() },
}))
const page = { revisionId: 'r1', pageId: 'page', name: 'Page', path: 'index.html' }
const member = (): ReviewThreadScope => ({
  kind: 'member',
  page,
  versionId: 'v1',
  actorId: 'u1',
  project: {
    id: 'p1',
    name: 'Project',
    createdBy: 'u1',
    createdAt: 1,
    updatedAt: 1,
    ...ownerProjectAccess,
  },
})
const row = (): ReviewAssignment => ({
  threadId: 't1',
  assignmentVersion: 0,
  updatedAt: null,
  assignee: null,
})
const thread = (): ReviewThread => ({
  id: 't1',
  ...page,
  pageName: page.name,
  pagePath: page.path,
  summary: 'Question',
  authorName: 'Visitor',
  authorCompany: null,
  verificationLevel: 'email',
  state: 'open',
  configVersion: 0,
  createdAt: 1,
  updatedAt: 1,
})
const pager = <T>(data: T[], total = data.length) => ({ data, total, pageIndex: 0, pageSize: 20 })
const wrappers: VueWrapper[] = []
function setup(withThreads = false) {
  const scope = ref<ReviewThreadScope | undefined>(member()),
    open = ref(true),
    selected = ref<string | undefined>(withThreads ? undefined : 't1'),
    grants = ref([p.version.query, p.version.save] as string[]),
    readable = computed(() => grants.value.includes(p.version.query))
  let state!: ReturnType<typeof useReviewAssignment>,
    feedback: ReturnType<typeof useReviewThreads> | undefined
  const wrapper = mount(
    hookHarness(() => {
      if (withThreads) {
        feedback = useReviewThreads(scope, open, shallowRef<ReviewContext>())
        state = feedback.assignment
      } else state = useReviewAssignment(scope, open, selected, readable)
    }),
    {
      global: {
        provide: { [permissionKey]: { can: (key: string) => grants.value.includes(key) } },
      },
    },
  )
  wrappers.push(wrapper)
  return { state, scope, open, selected, grants, feedback }
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
  vi.mocked(reviewThreadsApi.assignment).mockReset().mockResolvedValue(row())
  vi.mocked(reviewThreadsApi.assignees)
    .mockReset()
    .mockResolvedValue(pager([{ userId: 'u2', name: 'Editor <b>name</b>' }], 41))
  vi.mocked(reviewThreadsApi.assign)
    .mockReset()
    .mockResolvedValue({
      ...row(),
      assignmentVersion: 1,
      updatedAt: 2,
      assignee: { userId: 'u2', name: 'Editor', available: true },
    })
  vi.mocked(reviewThreadsApi.query).mockResolvedValue(pager([thread()]))
  vi.mocked(reviewThreadsApi.detail).mockResolvedValue(thread())
  vi.mocked(reviewThreadsApi.messages).mockResolvedValue(pager([]))
  vi.mocked(publicReviewThreadsApi.query).mockResolvedValue(pager([]))
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:local')
      static revokeObjectURL = vi.fn()
    },
  )
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

it('loads one selected member assignment and only loads bounded literal candidates after explicit editing/search', async () => {
  const { state } = setup()
  await flushPromises()
  expect(reviewThreadsApi.assignment).toHaveBeenCalledWith(
    'v1',
    't1',
    { revisionId: 'r1', pageId: 'page' },
    expect.objectContaining({ silent: true }),
  )
  expect(reviewThreadsApi.assignees).not.toHaveBeenCalled()
  state.edit()
  await flushPromises()
  expect(state.total.value).toBe(41)
  state.keyword.value = '%_ Name'
  await state.search(3)
  expect(reviewThreadsApi.assignees).toHaveBeenLastCalledWith(
    'v1',
    't1',
    { revisionId: 'r1', pageId: 'page', pageIndex: 2, pageSize: 20, keyword: '%_ Name' },
    expect.anything(),
  )
  state.keyword.value = 'x'.repeat(101)
  await state.search()
  expect(reviewThreadsApi.assignees).toHaveBeenCalledTimes(2)
  expect(state.searchError.value).toBe(protoLocales.zh.assignmentKeywordInvalid)
  expect(state.searching.value).toBe(false)
})

it.each(['public', 'closed', 'unselected', 'no-query'] as const)(
  'makes no assignment requests for %s scope',
  async (kind) => {
    const { scope, open, selected, grants } = setup()
    await flushPromises()
    vi.clearAllMocks()
    if (kind === 'public')
      scope.value = {
        kind: 'public',
        page,
        pendingInvitation: false,
        share: {
          token: 'open',
          revisionMode: 'fixed',
          revisionId: 'r1',
          projectName: 'Project',
          versionName: 'Version',
          passwordRequired: false,
        },
      }
    if (kind === 'closed') open.value = false
    if (kind === 'unselected') selected.value = undefined
    if (kind === 'no-query') grants.value = []
    await flushPromises()
    expect(reviewThreadsApi.assignment).not.toHaveBeenCalled()
    expect(reviewThreadsApi.assignees).not.toHaveBeenCalled()
    expect(reviewThreadsApi.assign).not.toHaveBeenCalled()
  },
)

it('allows query-only assignment detail but no candidates, set or clear', async () => {
  const { state, grants } = setup()
  await flushPromises()
  grants.value = [p.version.query]
  state.edit()
  state.save(true)
  await state.search()
  await flushPromises()
  expect(state.data.value).toEqual(row())
  expect(state.canEdit.value).toBe(false)
  expect(reviewThreadsApi.assignees).not.toHaveBeenCalled()
  expect(reviewThreadsApi.assign).not.toHaveBeenCalled()
})

it('sets and clears explicitly with the independent assignment version and no automatic submission', async () => {
  const { state } = setup()
  await flushPromises()
  state.edit()
  await flushPromises()
  state.selection.value = 'u2'
  expect(reviewThreadsApi.assign).not.toHaveBeenCalled()
  state.save()
  await flushPromises()
  const input = vi.mocked(reviewThreadsApi.assign).mock.calls[0]![2]
  expect(input).toMatchObject({
    revisionId: 'r1',
    pageId: 'page',
    assigneeId: 'u2',
    expectedVersion: 0,
  })
  expect(input.clientRequestId).toMatch(/^[\x21-\x7e]{1,128}$/)
  state.save(true)
  await flushPromises()
  expect(vi.mocked(reviewThreadsApi.assign).mock.calls[1]![2]).toMatchObject({
    assigneeId: null,
    expectedVersion: 1,
  })
})

it('does not let a delayed same-target detail overwrite a successful assignment', async () => {
  const { state } = setup()
  await flushPromises()
  const old = deferred<ReviewAssignment>()
  vi.mocked(reviewThreadsApi.assignment).mockReturnValueOnce(old.promise)
  const loading = state.load()
  const signal = vi.mocked(reviewThreadsApi.assignment).mock.calls[1]![3]!.signal!
  state.save(true)
  await flushPromises()
  expect(signal.aborted).toBe(true)
  expect(state.loading.value).toBe(false)
  expect(state.data.value?.assignmentVersion).toBe(1)
  old.resolve(row())
  await loading
  expect(state.data.value?.assignmentVersion).toBe(1)
})

it('locks an unknown payload/key until exact manual retry or explicit abandonment, including a refresh', async () => {
  const { state } = setup()
  await flushPromises()
  vi.mocked(reviewThreadsApi.assign).mockRejectedValueOnce(new ApiError('unknown', 0))
  state.save(true)
  await flushPromises()
  const original = vi.mocked(reviewThreadsApi.assign).mock.calls[0]![2]
  expect(state.unknown.value).toBe(true)
  await state.load()
  state.edit()
  state.selection.value = 'other'
  state.save()
  expect(reviewThreadsApi.assign).toHaveBeenCalledTimes(1)
  state.retry()
  await flushPromises()
  expect(vi.mocked(reviewThreadsApi.assign).mock.calls[1]![2]).toBe(original)
  expect(state.unknown.value).toBe(false)
  vi.mocked(reviewThreadsApi.assign).mockRejectedValueOnce(new ApiError('unknown', 500))
  state.save(true)
  await flushPromises()
  state.discard()
  await flushPromises()
  expect(state.unknown.value).toBe(false)
  expect(reviewThreadsApi.assign).toHaveBeenCalledTimes(3)
  state.save(true)
  await flushPromises()
  expect(vi.mocked(reviewThreadsApi.assign).mock.calls[3]![2].clientRequestId).not.toBe(
    vi.mocked(reviewThreadsApi.assign).mock.calls[2]![2].clientRequestId,
  )
})

it('refreshes only assignment on conflict, preserving reply/File and unknown reply receipt even across message refresh', async () => {
  const { state, feedback } = setup(true)
  await flushPromises()
  feedback!.choose(feedback!.threads.value[0])
  await flushPromises()
  feedback!.text.value = 'Private reply draft'
  const image = new File(['png'], 'local.png', { type: 'image/png' })
  feedback!.selectImage(image)
  vi.mocked(reviewThreadsApi.replyImage).mockRejectedValue(new ApiError('unknown', 0))
  await feedback!.send()
  const reply = vi.mocked(reviewThreadsApi.replyImage).mock.calls[0]![2]
  const queries = vi.mocked(reviewThreadsApi.query).mock.calls.length
  vi.mocked(reviewThreadsApi.assign).mockRejectedValueOnce(new ApiError('conflict', 409))
  state.save(true)
  await flushPromises()
  expect(state.notice.value).toBe(protoLocales.zh.assignmentConflict)
  expect(reviewThreadsApi.query).toHaveBeenCalledTimes(queries)
  expect(feedback!.text.value).toBe('Private reply draft')
  expect(feedback!.imageFile.value).toBe(image)
  vi.mocked(reviewThreadsApi.assign).mockRejectedValueOnce(new ApiError('unknown', 0))
  state.save(true)
  await flushPromises()
  const assignment = vi.mocked(reviewThreadsApi.assign).mock.calls[1]![2]
  await feedback!.load()
  expect(state.unknown.value).toBe(true)
  state.retry()
  await flushPromises()
  expect(vi.mocked(reviewThreadsApi.assign).mock.calls[2]![2]).toBe(assignment)
  await feedback!.send()
  expect(vi.mocked(reviewThreadsApi.replyImage).mock.calls[1]![2]).toEqual(reply)
})

it.each(['thread', 'scope', 'actor', 'close', 'unmount', 'permission'] as const)(
  'aborts a late write on %s without installing old assignment',
  async (kind) => {
    const { state, scope, selected, open, grants } = setup()
    await flushPromises()
    const pending = deferred<ReviewAssignment>()
    vi.mocked(reviewThreadsApi.assign).mockReturnValueOnce(pending.promise)
    state.save(true)
    const signal = vi.mocked(reviewThreadsApi.assign).mock.calls[0]![3]!.signal!
    if (kind === 'thread') selected.value = 't2'
    if (kind === 'scope') scope.value = undefined
    if (kind === 'actor') scope.value = { ...member(), actorId: 'other' } as ReviewThreadScope
    if (kind === 'close') open.value = false
    if (kind === 'unmount') wrappers[0]!.unmount()
    if (kind === 'permission') grants.value = [p.version.query]
    expect(signal.aborted).toBe(true)
    pending.resolve({ ...row(), assignmentVersion: 777 })
    await flushPromises()
    expect(state.data.value?.assignmentVersion).not.toBe(777)
  },
)

it('aborts and ignores stale searches while preserving an explicitly unavailable assignee', async () => {
  const { state } = setup()
  await flushPromises()
  const pending = deferred<ReturnType<typeof pager<{ userId: string; name: string }>>>()
  vi.mocked(reviewThreadsApi.assignees).mockReturnValueOnce(pending.promise)
  state.edit()
  const signal = vi.mocked(reviewThreadsApi.assignees).mock.calls[0]![3]!.signal!
  state.keyword.value = 'New'
  await state.search()
  expect(signal.aborted).toBe(true)
  pending.resolve(pager([{ userId: 'late', name: 'Late' }]))
  await flushPromises()
  expect(state.candidates.value.some((candidate) => candidate.userId === 'late')).toBe(false)
  vi.mocked(reviewThreadsApi.assignment).mockResolvedValue({
    ...row(),
    assignee: { userId: 'former', name: 'Former', available: false },
  })
  await state.load()
  expect(state.data.value?.assignee?.available).toBe(false)
  expect(reviewThreadsApi.assign).not.toHaveBeenCalled()
})

it('clears private sibling results after denied access without clearing the selected reply', async () => {
  const { state, feedback } = setup(true)
  await flushPromises()
  feedback!.choose(feedback!.threads.value[0])
  await flushPromises()
  feedback!.text.value = 'Kept'
  const pending = deferred<ReturnType<typeof pager<{ userId: string; name: string }>>>()
  vi.mocked(reviewThreadsApi.assignees).mockReturnValueOnce(pending.promise)
  state.edit()
  const signal = vi.mocked(reviewThreadsApi.assignees).mock.calls[0]![3]!.signal!
  vi.mocked(reviewThreadsApi.assignment).mockRejectedValueOnce(new ApiError('denied', 403))
  await state.load()
  expect(signal.aborted).toBe(true)
  pending.resolve(pager([{ userId: 'late', name: 'Late' }]))
  await flushPromises()
  expect(state.candidates.value).toEqual([])
  expect(state.data.value).toBeUndefined()
  expect(feedback!.text.value).toBe('Kept')
  expect(feedback!.selectedId.value).toBe('t1')
})

it('renders unavailable names as text and a labelled bounded candidate editor', async () => {
  const { state, feedback } = setup(true)
  await flushPromises()
  feedback!.choose(feedback!.threads.value[0])
  await flushPromises()
  state.data.value = {
    ...row(),
    assignee: { userId: 'former', name: '<b>Former</b>', available: false },
  }
  const wrapper = mount(ReviewThreadsDrawer, {
    props: { open: true, page, state: feedback! },
    global: { plugins: [i18n], stubs: { ADrawer: { template: '<div><slot /></div>' } } },
  })
  wrappers.push(wrapper)
  expect(wrapper.text()).toContain('<b>Former</b>')
  expect(wrapper.text()).toContain(protoLocales.zh.assignmentFormerUnavailable)
  expect(wrapper.find('.feedback-assignment b').exists()).toBe(false)
  await wrapper
    .findAll('button')
    .find((button) => button.text() === protoLocales.zh.assignmentEdit)!
    .trigger('click')
  await flushPromises()
  expect(wrapper.get('label[for="review-assignee"]').text()).toBe(
    protoLocales.zh.assignmentCandidate,
  )
  expect(wrapper.get('#review-assignee-keyword').attributes('maxlength')).toBe('100')
  expect(wrapper.get('input#review-assignee').attributes('role')).toBe('combobox')
})
