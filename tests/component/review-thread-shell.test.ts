import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import PreviewView from '@/modules/protohub-manager-ui/views/preview/index.vue'
import ShareView from '@/modules/protohub-manager-ui/views/share/index.vue'
import { usePreview } from '@/modules/protohub-manager-ui/views/preview/hooks/usePreview'
import { usePublicShare } from '@/modules/protohub-manager-ui/views/share/hooks/usePublicShare'
import { useReviewIdentity } from '@/modules/protohub-manager-ui/views/share/hooks/useReviewIdentity'
import {
  publicReviewThreadsApi,
  reviewThreadsApi,
} from '@/modules/protohub-manager-ui/api/review-thread'
import type { WorkspaceContext, PublicShare } from '@/modules/protohub-manager-ui/types'
import { permissionKey } from '@/shared/auth/provider'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { i18n } from '@/shared/i18n'
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
  publicReviewThreadsApi: { query: vi.fn(), detail: vi.fn(), messages: vi.fn() },
  reviewThreadsApi: { query: vi.fn(), detail: vi.fn(), messages: vi.fn() },
}))
const context: WorkspaceContext = {
  revisionId: 'r1',
  title: 'Project',
  versionName: 'V1',
  runtimeBaseUrl: '/runtime/grant',
  entryFile: 'index.html',
  pages: [],
}
const wrappers: VueWrapper[] = []
async function setup(kind: 'preview' | 'share', can = true) {
  const path = kind === 'share' ? '/share/open' : '/preview/p1/v1'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path, component: { template: '<div />' } }],
  })
  await router.push(`${path}?revisionId=r1&pageId=page&threadId=${'a'.repeat(43)}`)
  const wrapper = mount(kind === 'share' ? ShareView : PreviewView, {
    global: {
      plugins: [router, i18n, createPinia()],
      provide: { [permissionKey]: { can: () => can } },
      stubs: {
        PrototypeWorkspace: { template: '<div>Loaded prototype</div>' },
        ReviewThreadsDrawer: true,
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  vi.mocked(useReviewIdentity).mockReturnValue({
    context: shallowRef(),
    loading: ref(false),
  } as ReturnType<typeof useReviewIdentity>)
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

it.each(['viewer', 'no-query'] as const)(
  'explains a valid target denied to %s without any detail/message request',
  async (kind) => {
    vi.mocked(usePreview).mockReturnValue({
      revision: shallowRef(),
      data: shallowRef(context),
      project: shallowRef({
        id: 'p1',
        name: 'Project',
        createdBy: 'u1',
        createdAt: 1,
        updatedAt: 1,
        ...ownerProjectAccess,
        capabilities: { ...ownerProjectAccess.capabilities, edit: kind !== 'viewer' },
      }),
      loading: ref(false),
      error: ref(''),
      expired: ref(false),
      load: vi.fn(),
    } as ReturnType<typeof usePreview>)
    const wrapper = await setup('preview', kind !== 'no-query')
    expect(wrapper.text()).toContain(protoLocales.zh.feedbackUnavailable)
    expect(wrapper.text()).toContain('Loaded prototype')
    expect(reviewThreadsApi.detail).not.toHaveBeenCalled()
    expect(reviewThreadsApi.messages).not.toHaveBeenCalled()
  },
)

it('explains a closed review policy only after password authorization has loaded the shell', async () => {
  const data = shallowRef<{ share?: PublicShare; context?: WorkspaceContext }>({
    share: {
      token: 'open',
      revisionId: 'r1',
      revisionMode: 'fixed',
      passwordRequired: true,
      projectName: 'Project',
      versionName: 'V1',
      reviewEnabled: false,
    },
  })
  vi.mocked(usePublicShare).mockReturnValue({
    resource: { data, loading: ref(false), error: ref(''), load: vi.fn() },
    task: { error: ref(''), busy: ref(false) },
    password: ref(''),
    verify: vi.fn(),
  } as unknown as ReturnType<typeof usePublicShare>)
  const wrapper = await setup('share')
  expect(wrapper.text()).not.toContain(protoLocales.zh.feedbackUnavailable)
  data.value = { ...data.value, context }
  await flushPromises()
  expect(wrapper.text()).toContain(protoLocales.zh.feedbackUnavailable)
  expect(publicReviewThreadsApi.detail).not.toHaveBeenCalled()
  expect(publicReviewThreadsApi.messages).not.toHaveBeenCalled()
})

it('does not mistake a still-loading member shell for a denied target', async () => {
  vi.mocked(usePreview).mockReturnValue({
    revision: shallowRef(),
    data: shallowRef(),
    project: shallowRef(),
    loading: ref(true),
    error: ref(''),
    expired: ref(false),
    load: vi.fn(),
  })
  const wrapper = await setup('preview', false)
  expect(wrapper.text()).not.toContain(protoLocales.zh.feedbackUnavailable)
  expect(reviewThreadsApi.detail).not.toHaveBeenCalled()
  expect(reviewThreadsApi.messages).not.toHaveBeenCalled()
})
