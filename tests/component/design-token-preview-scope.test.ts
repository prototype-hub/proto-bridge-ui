import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import PreviewView from '@/modules/protohub-manager-ui/views/preview/index.vue'
import DesignTokenPackagesWorkspace from '@/modules/protohub-manager-ui/components/DesignTokenPackagesWorkspace.vue'
import { projectsApi, versionsApi } from '@/modules/protohub-manager-ui/api'
import { designTokenPackagesApi as api } from '@/modules/protohub-manager-ui/api/design-token-package'
import { useSession } from '@/app/stores/session'
import { ApiError } from '@/shared/api/errors'
import { token } from '@/shared/auth/token'
import { permissionKey } from '@/shared/auth/provider'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { projectTestPinia } from '../fixtures/project-session'
import { tokenDocument, tokenPackage, tokenScope } from '../fixtures/design-token-package'

vi.mock('@/modules/protohub-manager-ui/api/design-token-package', () => ({
  designTokenPackagesApi: {
    query: vi.fn(),
    get: vi.fn(),
    document: vi.fn(),
    validate: vi.fn(),
    import: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    content: vi.fn(),
  },
}))
const wrappers: VueWrapper[] = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(projectsApi, 'get').mockImplementation(async () => structuredClone(tokenScope.project))
  vi.spyOn(versionsApi, 'get').mockResolvedValue({
    ...tokenScope.revision,
    revisionId: 'r1',
    currentRevisionId: 'r1',
    revisionCount: 1,
    migrationRequired: false,
    status: 'ready',
    runtimeBaseUrl: null,
    previewUrl: null,
  })
  vi.spyOn(versionsApi, 'revision').mockImplementation(async () =>
    structuredClone(tokenScope.revision),
  )
  vi.spyOn(versionsApi, 'revisionPages').mockResolvedValue([])
  vi.spyOn(versionsApi, 'revisionPreviewSession').mockImplementation(async () => ({
    runtimeBaseUrl: '/api/prototype-hub/runtime/v1/scoped-key',
    previewUrl: '/api/prototype-hub/runtime/v1/scoped-key/index.html',
    expiresAt: Date.now() + 300000,
  }))
  vi.mocked(api.query).mockResolvedValue({ data: [], total: 0, pageIndex: 0, pageSize: 20 })
  vi.mocked(api.validate).mockResolvedValue(tokenDocument(1))
  vi.mocked(api.import).mockResolvedValue({
    id: tokenPackage.id,
    status: 'current',
    package: structuredClone(tokenPackage),
  })
  vi.mocked(api.document).mockResolvedValue(tokenDocument(1))
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  i18n.global.locale.value = 'zh'
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  token.clear()
})
async function setup(draft = true, attachTo?: HTMLElement) {
  const pinia = projectTestPinia(),
    read = ref(true)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/preview/:projectId/:versionId', component: PreviewView },
      { path: '/search', name: 'PrototypeHub-search', component: { template: '<div />' } },
    ],
  })
  await router.push('/preview/p1/v1?revisionId=r1')
  const wrapper = mount(RouterView, {
    attachTo,
    global: {
      plugins: [router, pinia, i18n],
      provide: {
        [permissionKey]: {
          can: (permission: string) => (permission.endsWith(':query') ? read.value : true),
        },
      },
      stubs: {
        Teleport: true,
        PrototypeWorkspace: { template: '<div data-runtime-frame><slot name="actions" /></div>' },
        ADropdown: { template: '<div><slot /><slot name="overlay" /></div>' },
        ReviewThreadsDrawer: true,
        ReviewThreadsOverviewDrawer: true,
        ReviewAssociationsDrawer: true,
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  await wrapper
    .findAll('[role="menuitem"]')
    .find((item) => item.text() === protoLocales.zh.tokenPackages)!
    .trigger('click')
  await flushPromises()
  const workspace = wrapper.findComponent(DesignTokenPackagesWorkspace)
  const file = new File(['\ufeff { "color": {} }'], 'original.json')
  if (draft) {
    await workspace
      .findAll('button')
      .find((button) => button.text() === protoLocales.zh.tokenImport)!
      .trigger('click')
    const input = workspace.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()
    await workspace.get('#token-source-name').setValue('界面基础规范 · 手机验收')
  }
  return { wrapper, workspace, file, router, read, session: useSession(pinia) }
}
async function reauthorize(wrapper: VueWrapper) {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === protoLocales.zh.reauthorizePreview)!
    .trigger('click')
  await flushPromises()
}
it('preserves the actual child File/source/frozen pending request across expiry and explicit reauthorization', async () => {
  const { wrapper, workspace, file } = await setup()
  vi.mocked(api.import).mockRejectedValueOnce(new ApiError('unknown outcome'))
  await workspace.get('.token-stage-actions .ant-btn-primary').trigger('click')
  await flushPromises()
  const first = vi.mocked(api.import).mock.calls[0]!
  expect(first[1]).toBe(file)
  await vi.advanceTimersByTimeAsync(300000)
  await flushPromises()
  expect(wrapper.find('[data-runtime-frame]').exists()).toBe(false)
  expect(wrapper.findComponent(DesignTokenPackagesWorkspace).vm.$.uid).toBe(workspace.vm.$.uid)
  expect((workspace.get('#token-source-name').element as HTMLInputElement).value).toBe(
    '界面基础规范 · 手机验收',
  )
  expect(versionsApi.revisionPreviewSession).toHaveBeenCalledTimes(1)
  await reauthorize(wrapper)
  expect(wrapper.findComponent(DesignTokenPackagesWorkspace).vm.$.uid).toBe(workspace.vm.$.uid)
  expect(versionsApi.revisionPreviewSession).toHaveBeenCalledTimes(2)
  vi.mocked(api.import).mockResolvedValueOnce({
    id: tokenPackage.id,
    status: 'missing',
    package: null,
  })
  await workspace
    .findAll('button')
    .find((button) => button.text() === protoLocales.zh.tokenRetry)!
    .trigger('click')
  await flushPromises()
  expect(vi.mocked(api.import).mock.calls[1]!.slice(0, 5)).toEqual(first.slice(0, 5))
  expect(vi.mocked(api.import).mock.calls[1]![1]).toBe(file)
})
it('returns keyboard focus to reauthorization when the expired preview removed the F33 opener', async () => {
  const target = document.createElement('div')
  document.body.append(target)
  try {
    const { wrapper, workspace } = await setup(false, target)
    await vi.advanceTimersByTimeAsync(300000)
    await workspace.get(`button[aria-label="${protoLocales.zh.tokenClose}"]`).trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(DesignTokenPackagesWorkspace).exists()).toBe(false)
    const reauthorizeButton = wrapper
      .findAll('button')
      .find((button) => button.text() === protoLocales.zh.reauthorizePreview)!
    expect(document.activeElement).toBe(reauthorizeButton.element)
  } finally {
    target.remove()
  }
})
it.each([
  ['project', 401],
  ['project', 403],
  ['project', 404],
  ['version', 401],
  ['version', 403],
  ['version', 404],
  ['revision', 401],
  ['revision', 403],
  ['revision', 404],
] as const)('clears captured member state on a fresh %s %s denial', async (resource, status) => {
  const { wrapper } = await setup()
  await vi.advanceTimersByTimeAsync(300000)
  const method =
    resource === 'project'
      ? projectsApi.get
      : resource === 'version'
        ? versionsApi.get
        : versionsApi.revision
  vi.mocked(method).mockRejectedValueOnce(new ApiError('member scope unavailable', status))
  await reauthorize(wrapper)
  expect(wrapper.findComponent(DesignTokenPackagesWorkspace).exists()).toBe(false)
  expect(api.import).not.toHaveBeenCalled()
})
it('clears captured state when a fresh project response denies READ', async () => {
  const { wrapper } = await setup()
  await vi.advanceTimersByTimeAsync(300000)
  vi.mocked(projectsApi.get).mockResolvedValueOnce({
    ...tokenScope.project,
    capabilities: { ...tokenScope.project.capabilities, read: false },
  })
  await reauthorize(wrapper)
  expect(wrapper.findComponent(DesignTokenPackagesWorkspace).exists()).toBe(false)
})
it.each([
  ['project', 500],
  ['project', 0],
  ['runtime', 401],
  ['runtime', 403],
  ['runtime', 404],
  ['runtime', 500],
] as const)('preserves the member draft for a %s %s failure', async (resource, status) => {
  const { wrapper, workspace } = await setup()
  await vi.advanceTimersByTimeAsync(300000)
  const method = resource === 'project' ? projectsApi.get : versionsApi.revisionPreviewSession
  vi.mocked(method).mockRejectedValueOnce(new ApiError('temporary failure', status))
  await reauthorize(wrapper)
  expect(wrapper.findComponent(DesignTokenPackagesWorkspace).vm.$.uid).toBe(workspace.vm.$.uid)
  expect((workspace.get('#token-source-name').element as HTMLInputElement).value).toBe(
    '界面基础规范 · 手机验收',
  )
})
it.each(['actor', 'read', 'route'] as const)(
  'clears the captured scope when %s identity changes',
  async (kind) => {
    const { wrapper, session, read, router } = await setup(kind !== 'route')
    if (kind === 'actor') session.user = { id: 'u2', username: 'other', name: 'Other', status: 1 }
    else if (kind === 'read') read.value = false
    else await router.push('/preview/p1/v1?revisionId=r2')
    await flushPromises()
    expect(wrapper.findComponent(DesignTokenPackagesWorkspace).exists()).toBe(false)
  },
)
