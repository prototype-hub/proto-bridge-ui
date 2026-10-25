import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h, onMounted, ref, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import PreviewView from '@/modules/protohub-manager-ui/views/preview/index.vue'
import ShareView from '@/modules/protohub-manager-ui/views/share/index.vue'
import { usePreview } from '@/modules/protohub-manager-ui/views/preview/hooks/usePreview'
import { usePublicShare } from '@/modules/protohub-manager-ui/views/share/hooks/usePublicShare'
import { useReviewIdentity } from '@/modules/protohub-manager-ui/views/share/hooks/useReviewIdentity'
import { useSession } from '@/app/stores/session'
import {
  publicReviewThreadsApi,
  reviewThreadsApi,
} from '@/modules/protohub-manager-ui/api/review-thread'
import type {
  ReviewContext,
  ReviewThread,
  WorkspaceContext,
} from '@/modules/protohub-manager-ui/types'
import type { ReviewThreadsController } from '@/modules/protohub-manager-ui/hooks/useReviewThreads'
import type { ReviewThreadsOverviewController } from '@/modules/protohub-manager-ui/hooks/useReviewThreadsOverview'
import { permissionKey } from '@/shared/auth/provider'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { ApiError } from '@/shared/api/errors'
import { ownerProjectAccess } from '../fixtures/project-access'
vi.mock('@/modules/protohub-manager-ui/views/preview/hooks/usePreview', () => ({
  usePreview: vi.fn(),
}))
vi.mock('@/modules/protohub-manager-ui/views/share/hooks/usePublicShare', () => ({
  usePublicShare: vi.fn(),
}))
vi.mock('@/modules/protohub-manager-ui/views/share/hooks/useReviewIdentity', () => ({
  useReviewIdentity: vi.fn(),
}))
vi.mock('@/modules/protohub-manager-ui/api/review-thread', () => ({
  publicReviewThreadsApi: {
    query: vi.fn(),
    detail: vi.fn(),
    messages: vi.fn(),
    overview: vi.fn(),
    replyImage: vi.fn(),
  },
  reviewThreadsApi: {
    query: vi.fn(),
    detail: vi.fn(),
    messages: vi.fn(),
    overview: vi.fn(),
    replyImage: vi.fn(),
    assignment: vi.fn(),
    assignees: vi.fn(),
    assign: vi.fn(),
  },
}))
const id = 'a'.repeat(43),
  otherId = 'b'.repeat(43)
const page = { revisionId: 'r1', pageId: 'home', name: 'Home', path: 'index.html' }
const thread = (): ReviewThread => ({
  id,
  revisionId: 'r1',
  pageId: 'home',
  pageName: 'Home',
  pagePath: 'index.html',
  summary: 'Question',
  authorName: 'Visitor',
  authorCompany: null,
  verificationLevel: 'email',
  state: 'open',
  configVersion: 0,
  createdAt: 1,
  updatedAt: 1,
})
const context: WorkspaceContext = {
  revisionId: 'r1',
  title: 'Project',
  versionName: 'V1',
  runtimeBaseUrl: '/runtime/grant',
  entryFile: 'index.html',
  pages: [
    { name: 'Home', pageId: 'home', path: 'index.html' },
    { name: 'Other', pageId: 'other', path: 'other.html' },
  ],
}
const identityContext = (): ReviewContext => ({
  revisionId: 'r1',
  enabled: true,
  mailAvailable: true,
  allowComment: true,
  allowUnverified: true,
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
const pager = <T>(data: T[]) => ({ data, total: data.length, pageIndex: 0, pageSize: 20 })
const ThreadDrawer = defineComponent({
  props: ['state', 'open'],
  emits: ['overview'],
  setup:
    (_, { slots }) =>
    () =>
      h('div', slots.default?.()),
})
const OverviewDrawer = defineComponent({
  props: ['state', 'open', 'guarded', 'blocked', 'currentThreadId'],
  emits: ['view', 'close', 'authenticate'],
  render: () => h('div'),
})
const IdentityDrawer = defineComponent({
  props: ['state', 'open', 'returnToFeedback', 'returnToOverview'],
  emits: ['feedback', 'close'],
  render: () => h('div'),
})
const Workspace = defineComponent({
  setup: (_, { emit, slots }) => {
    onMounted(() => emit('pageChange', page))
    return () => h('main', slots.actions?.())
  },
})
const wrappers: VueWrapper[] = []
async function setup(kind: 'share' | 'preview') {
  const identity = shallowRef<ReviewContext | undefined>(identityContext())
  const identityLoad = vi.fn()
  vi.mocked(useReviewIdentity).mockReturnValue({
    context: identity,
    loading: ref(false),
    load: identityLoad,
  } as unknown as ReturnType<typeof useReviewIdentity>)
  vi.mocked(usePreview).mockReturnValue({
    data: shallowRef(context),
    project: shallowRef({
      id: 'p1',
      name: 'Project',
      createdBy: 'u1',
      createdAt: 1,
      updatedAt: 1,
      ...ownerProjectAccess,
    }),
    loading: ref(false),
    error: ref(''),
    expired: ref(false),
    load: vi.fn(),
  })
  vi.mocked(usePublicShare).mockReturnValue({
    resource: {
      data: shallowRef({
        context,
        share: {
          token: 'open',
          revisionId: 'r1',
          revisionMode: 'fixed',
          accessKey: 'grant',
          reviewEnabled: true,
          projectName: 'Project',
          versionName: 'V1',
          passwordRequired: false,
        },
      }),
      loading: ref(false),
      error: ref(''),
      load: vi.fn(),
    },
    task: { busy: ref(false), error: ref('') },
    password: ref(''),
    verify: vi.fn(),
  } as unknown as ReturnType<typeof usePublicShare>)
  const path = kind === 'share' ? '/share/open' : '/preview/p1/v1'
  const router = createRouter({
    history: createMemoryHistory('/tools/'),
    routes: [{ path, component: { template: '<div />' } }],
  })
  await router.push(`${path}?revisionId=r1&pageId=home&threadId=${id}`)
  const pinia = createPinia()
  useSession(pinia).user = { id: 'u1', name: 'Owner', username: 'owner' }
  const wrapper = mount(kind === 'share' ? ShareView : PreviewView, {
    global: {
      plugins: [router, pinia, i18n],
      provide: { [permissionKey]: { can: () => true } },
      stubs: {
        PrototypeWorkspace: Workspace,
        ReviewThreadsDrawer: ThreadDrawer,
        ReviewThreadsOverviewDrawer: OverviewDrawer,
        ReviewIdentityDrawer: IdentityDrawer,
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  const current = () =>
    wrapper.findComponent(ThreadDrawer).props('state') as ReviewThreadsController
  const overview = () =>
    wrapper.findComponent(OverviewDrawer).props('state') as ReviewThreadsOverviewController
  return { wrapper, router, current, overview, identity, identityLoad }
}
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  for (const api of [publicReviewThreadsApi, reviewThreadsApi]) {
    vi.mocked(api.query).mockResolvedValue(pager([thread()]))
    vi.mocked(api.detail).mockResolvedValue(thread())
    vi.mocked(api.messages).mockResolvedValue(pager([]))
    vi.mocked(api.overview).mockResolvedValue(
      pager([thread(), { ...thread(), id: otherId, pageId: 'other' }]),
    )
    vi.mocked(api.replyImage).mockResolvedValue({} as never)
  }
  vi.mocked(reviewThreadsApi.assignment).mockResolvedValue({
    threadId: id,
    assignmentVersion: 0,
    updatedAt: null,
    assignee: null,
  })
  vi.mocked(reviewThreadsApi.assignees).mockResolvedValue(pager([{ userId: 'u2', name: 'Editor' }]))
  vi.mocked(reviewThreadsApi.assign).mockRejectedValue(new ApiError('unknown'))
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
      static createObjectURL = vi.fn(() => 'blob:draft')
      static revokeObjectURL = vi.fn()
    },
  )
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

it.each(['share', 'preview'] as const)(
  'keeps the original %s File/text/request key through overview open/close and same-target return',
  async (kind) => {
    const { wrapper, current } = await setup(kind)
    const state = current(),
      image = new File(['png'], 'private.png', { type: 'image/png' })
    state.text.value = 'Unsure reply'
    state.selectImage(image)
    const api = kind === 'share' ? publicReviewThreadsApi : reviewThreadsApi
    vi.mocked(api.replyImage).mockRejectedValueOnce(new ApiError('unknown'))
    await state.send()
    const key = vi.mocked(api.replyImage).mock.calls[0]![2].clientRequestId
    expect(state.hasPendingRequest.value).toBe(true)
    wrapper.findComponent(ThreadDrawer).vm.$emit('overview')
    await flushPromises()
    expect(wrapper.findComponent(ThreadDrawer).props('open')).toBe(false)
    expect(wrapper.findComponent(OverviewDrawer).props('guarded')).toBe(true)
    expect(state.text.value).toBe('Unsure reply')
    expect(state.imageFile.value).toBe(image)
    wrapper.findComponent(OverviewDrawer).vm.$emit('close')
    await flushPromises()
    expect(wrapper.findComponent(ThreadDrawer).props('open')).toBe(true)
    wrapper.findComponent(ThreadDrawer).vm.$emit('overview')
    await flushPromises()
    wrapper.findComponent(OverviewDrawer).vm.$emit('view', thread())
    await flushPromises()
    expect(state.text.value).toBe('Unsure reply')
    expect(state.imageFile.value).toBe(image)
    await state.send()
    expect(vi.mocked(api.replyImage).mock.calls[1]![2].clientRequestId).toBe(key)
  },
)

it('keeps member assignment unknown payload/key when overview visually hides the thread drawer', async () => {
  const { wrapper, current } = await setup('preview')
  const state = current()
  state.assignment.edit()
  await flushPromises()
  state.assignment.selection.value = 'u2'
  await state.assignment.save()
  expect(state.assignment.unknown.value).toBe(true)
  const payload = vi.mocked(reviewThreadsApi.assign).mock.calls[0]![2]
  wrapper.findComponent(ThreadDrawer).vm.$emit('overview')
  await flushPromises()
  expect(state.assignment.unknown.value).toBe(true)
  expect(wrapper.findComponent(OverviewDrawer).props('guarded')).toBe(true)
  wrapper.findComponent(OverviewDrawer).vm.$emit('close')
  await flushPromises()
  await state.assignment.retry()
  expect(vi.mocked(reviewThreadsApi.assign).mock.calls[1]![2]).toEqual(payload)
})

it('returns from identity to overview with its filter/page kept and keeps identity active while the overview is open', async () => {
  const { wrapper, overview, identity, identityLoad } = await setup('share')
  wrapper.findComponent(ThreadDrawer).vm.$emit('overview')
  await flushPromises()
  overview().changeFilter('resolved')
  overview().page(3)
  await flushPromises()
  identity.value = { ...identityContext(), session: null }
  await flushPromises()
  wrapper.findComponent(OverviewDrawer).vm.$emit('authenticate')
  await flushPromises()
  expect(identityLoad).toHaveBeenCalledTimes(1)
  expect(wrapper.findComponent(IdentityDrawer).props('returnToOverview')).toBe(true)
  identity.value = { ...identityContext(), csrfToken: 'rotated' }
  wrapper.findComponent(IdentityDrawer).vm.$emit('feedback')
  await flushPromises()
  expect(wrapper.findComponent(OverviewDrawer).props('open')).toBe(true)
  expect(overview().filter.value).toBe('resolved')
  expect(overview().pageIndex.value).toBe(2)
  expect(vi.mocked(useReviewIdentity).mock.calls[0]![1].value).toBe(true)
})

it('blocks navigation during a mutation, validates overview rows, then navigates with only the explicit three IDs', async () => {
  const { wrapper, current, overview, router } = await setup('preview')
  wrapper.findComponent(ThreadDrawer).vm.$emit('overview')
  await flushPromises()
  const target = { ...thread(), id: otherId, pageId: 'other' }
  current().busy.value = true
  wrapper.findComponent(OverviewDrawer).vm.$emit('view', target)
  await flushPromises()
  expect(router.currentRoute.value.query.pageId).toBe('home')
  current().busy.value = false
  wrapper.findComponent(OverviewDrawer).vm.$emit('view', { ...target, pageId: 'missing' })
  await flushPromises()
  expect(overview().error.value).toBe(protoLocales.zh.feedbackInvalidTarget)
  wrapper.findComponent(OverviewDrawer).vm.$emit('view', target)
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({
    revisionId: 'r1',
    pageId: 'other',
    threadId: otherId,
  })
  expect(wrapper.findComponent(OverviewDrawer).props('open')).toBe(false)
})
