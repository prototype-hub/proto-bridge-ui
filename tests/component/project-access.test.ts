import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { h, ref } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { request } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { i18n } from '@/shared/i18n'
import { permissionKey } from '@/shared/auth/provider'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import type {
  Project,
  Version,
  Revision,
  ProjectMember,
  PreviewSession,
} from '@/modules/protohub-manager-ui/types'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import { projectsApi, versionsApi } from '@/modules/protohub-manager-ui/api'
import { useProjectDetail } from '@/modules/protohub-manager-ui/views/project/hooks/useProjectDetail'
import { usePreview } from '@/modules/protohub-manager-ui/views/preview/hooks/usePreview'
import { useProjectMembers } from '@/modules/protohub-manager-ui/views/project/hooks/useProjectMembers'
import { useShares } from '@/modules/protohub-manager-ui/views/project/hooks/useShares'
import ProjectDetail from '@/modules/protohub-manager-ui/views/project/detail/index.vue'
import PreviewView from '@/modules/protohub-manager-ui/views/preview/index.vue'
import { ownerProjectAccess } from '../fixtures/project-access'
import { hookHarness } from '../fixtures/hook-harness'

vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), put: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn(), deleted: vi.fn(), copyText: vi.fn() }))
const response = <T>(result: T) => ({ success: true, status: 200, result })
const project: Project = {
  id: 'p1',
  name: 'Private project',
  createdBy: 'u1',
  createdAt: 1,
  updatedAt: 1,
  ...ownerProjectAccess,
}
const version: Version = {
  currentRevisionId: 'r1',
  revisionId: 'r1',
  revisionCount: 1,
  migrationRequired: false,
  id: 'v1',
  projectId: 'p1',
  versionName: 'V1',
  entryFile: 'index.html',
  status: 'ready',
  createdBy: 'u1',
  createdAt: 1,
  runtimeBaseUrl: null,
  previewUrl: null,
}
const revision: Revision = {
  id: 'r1',
  projectId: 'p1',
  versionId: 'v1',
  versionName: 'V1',
  entryFile: 'index.html',
  manifestSha256: 'a'.repeat(64),
  fileCount: 3,
  totalBytes: 100,
  createdBy: 'u1',
  createdAt: 1,
}
const owner: ProjectMember = { userId: 'u1', username: 'owner', name: 'Owner', role: 'owner' }
const viewer: ProjectMember = { userId: 'u2', username: 'viewer', name: 'Viewer', role: 'viewer' }
const session = (): PreviewSession => ({
  runtimeBaseUrl: '/api/prototype-hub/runtime/v1/scoped-key',
  previewUrl: '/api/prototype-hub/runtime/v1/scoped-key/index.html',
  expiresAt: Date.now() + 300000,
})
const wrappers: VueWrapper[] = []
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
async function routerAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects/:id', name: 'project-detail', component: { render: () => h('div') } },
      {
        path: '/preview/:projectId/:versionId',
        name: 'PrototypeHub-preview-window',
        component: { render: () => h('div') },
      },
    ],
  })
  await router.push(path)
  return router
}
async function detailPage(can: (value: string | string[]) => boolean = () => true, ui = false) {
  const router = await routerAt('/projects/p1')
  let state!: ReturnType<typeof useProjectDetail>
  const harness = hookHarness(() => {
    state = useProjectDetail()
  })
  const wrapper = mount(ui ? ProjectDetail : harness, {
    global: {
      plugins: [createPinia(), router, i18n],
      provide: { [permissionKey]: { can } },
      stubs: { UploadDialog: true, ShareDialog: true, ProjectMembersDialog: true },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { state, router, wrapper }
}
async function previewPage(ui = false) {
  const router = await routerAt('/preview/p1/v1')
  let state!: ReturnType<typeof usePreview>
  const harness = hookHarness(() => {
    state = usePreview()
  })
  const wrapper = mount(ui ? PreviewView : harness, {
    global: {
      plugins: [router, i18n],
      stubs: {
        PrototypeWorkspace: {
          props: ['context'],
          template: '<iframe :src="context.runtimeBaseUrl" />',
        },
      },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { state, router, wrapper }
}
function membersDialog(initial: Project = project) {
  const selected = ref<Project | undefined>(structuredClone(initial))
  const open = ref(true)
  const changed = vi.fn()
  let state!: ReturnType<typeof useProjectMembers>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useProjectMembers(selected, open, changed)
      }),
    ),
  )
  return { state, selected, open, changed }
}
beforeEach(() => {
  vi.mocked(request.get)
    .mockReset()
    .mockImplementation(async (path) => {
      if (path === '/prototype-hub/projects/p1') return response(structuredClone(project))
      if (path === '/prototype-hub/versions/v1') return response(structuredClone(version))
      if (
        path === '/prototype-hub/versions/v1/current-revision' ||
        path === '/prototype-hub/versions/v1/revisions/r1'
      )
        return response(structuredClone(revision))
      if (path === '/prototype-hub/versions') return response([structuredClone(version)])
      if (path === '/prototype-hub/versions/_usage')
        return response({
          projectId: 'p1',
          versions: { used: 1, limit: 5, remaining: 4, canCreate: true, overLimit: false },
        })
      if (path.endsWith('/members')) return response([owner, viewer])
      if (path.endsWith('/member-candidates'))
        return response([{ userId: 'u2', name: 'Viewer', username: 'viewer' }])
      return response([])
    })
  vi.mocked(request.post)
    .mockReset()
    .mockImplementation(async (path) =>
      path === '/prototype-hub/versions/_query'
        ? response({ data: [structuredClone(version)], total: 1, pageIndex: 0, pageSize: 20 })
        : path.endsWith('/preview-session')
          ? response(session())
          : response(true),
    )
  vi.mocked(request.put).mockReset().mockResolvedValue(response(true))
  vi.mocked(request.remove).mockReset().mockResolvedValue(response(true))
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('fails closed without server capabilities and encodes every member and preview API segment', async () => {
  expect(projectAllows(undefined, 'edit')).toBe(false)
  expect(
    projectAllows({ ...project, capabilities: undefined } as unknown as Project, 'manageMembers'),
  ).toBe(false)
  await projectsApi.members('p/id')
  await projectsApi.candidates('p/id', 'name')
  await projectsApi.saveMember('p/id', 'u/id', 'viewer')
  await projectsApi.removeMember('p/id', 'u/id')
  await projectsApi.claim('p/id', 'u/id')
  await versionsApi.revisionPreviewSession('v/id', 'r/id')
  expect(request.get).toHaveBeenCalledWith(
    '/prototype-hub/projects/p%2Fid/members',
    undefined,
    undefined,
  )
  expect(request.get).toHaveBeenCalledWith(
    '/prototype-hub/projects/p%2Fid/member-candidates',
    { keyword: 'name' },
    undefined,
  )
  expect(request.put).toHaveBeenCalledWith(
    '/prototype-hub/projects/p%2Fid/members/u%2Fid',
    { role: 'viewer' },
    undefined,
  )
  expect(request.remove).toHaveBeenCalledWith(
    '/prototype-hub/projects/p%2Fid/members/u%2Fid',
    undefined,
    undefined,
  )
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/projects/p%2Fid/claim',
    { userId: 'u/id' },
    undefined,
  )
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/versions/v%2Fid/revisions/r%2Fid/preview-session',
    undefined,
    undefined,
  )
})
it('shows viewer preview while hiding upload, replacement, deletion, shares and member controls despite global grants', async () => {
  const original = vi.mocked(request.get).getMockImplementation()!
  vi.mocked(request.get).mockImplementation((path, ...args) =>
    path === '/prototype-hub/projects/p1'
      ? Promise.resolve(
          response({
            ...project,
            role: 'viewer',
            capabilities: {
              read: true,
              edit: false,
              manageMembers: false,
              deleteProject: false,
              manageShares: false,
            },
          }),
        )
      : original(path, ...args),
  )
  const { wrapper } = await detailPage(() => true, true)
  expect(wrapper.find('button[aria-label="Preview"]').exists()).toBe(true)
  for (const label of ['上传新修订', '删除', '分享管理'])
    expect(wrapper.find(`button[aria-label="${label}"]`).exists()).toBe(false)
  expect(wrapper.text()).not.toContain('上传版本')
  expect(wrapper.text()).not.toContain('项目成员')
})
it('keeps project member administration usable without unrelated version query permission', async () => {
  const { wrapper } = await detailPage(
    (permission) =>
      ['prototype-hub-project:query', 'prototype-hub-project:save'].includes(String(permission)),
    true,
  )
  expect(wrapper.text()).toContain('Private project')
  expect(wrapper.text()).toContain('项目成员')
  expect(request.post).not.toHaveBeenCalledWith(
    '/prototype-hub/versions/_query',
    expect.anything(),
    expect.anything(),
  )
  expect(request.get).not.toHaveBeenCalledWith(
    '/prototype-hub/versions/_usage',
    expect.anything(),
    expect.anything(),
  )
})
it('drops an old project and its controls before a failed navigation can leave them visible', async () => {
  const { state, router } = await detailPage()
  state.membersOpen.value = true
  state.upload()
  expect(state.resource.data.value.project?.id).toBe('p1')
  vi.mocked(request.get).mockRejectedValue(new ApiError('Unavailable', 404))
  await router.push('/projects/p2')
  expect(state.resource.data.value.project).toBeUndefined()
  expect(state.membersOpen.value).toBe(false)
  expect(state.uploadOpen.value).toBe(false)
  await flushPromises()
  expect(state.resource.data.value.versions).toEqual([])
})
it('uses only the exchanged short preview grant and never the nullable legacy version URLs', async () => {
  const { state } = await previewPage()
  expect(state.data.value?.runtimeBaseUrl).toBe(session().runtimeBaseUrl)
  expect(request.post).toHaveBeenCalledOnce()
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/versions/v1/revisions/r1/preview-session',
    undefined,
    expect.objectContaining({ silent: true, signal: expect.any(AbortSignal) }),
  )
})
it('rejects mixed project/version IDs before exchanging a preview grant', async () => {
  const original = vi.mocked(request.get).getMockImplementation()!
  vi.mocked(request.get).mockImplementation((path, ...args) =>
    path === '/prototype-hub/versions/v1'
      ? Promise.resolve(response({ ...version, projectId: 'p2' }))
      : original(path, ...args),
  )
  const { state } = await previewPage()
  expect(state.data.value).toBeUndefined()
  expect(state.error.value).toBe(protoLocales.zh.projectUnavailable)
  expect(request.post).not.toHaveBeenCalled()
})
it('unmounts expired preview content without background renewal and requires an explicit authorization', async () => {
  vi.useFakeTimers()
  const { wrapper } = await previewPage(true)
  expect(wrapper.find('iframe').exists()).toBe(true)
  await vi.advanceTimersByTimeAsync(300000)
  expect(wrapper.find('iframe').exists()).toBe(false)
  expect(wrapper.text()).toContain(protoLocales.zh.previewExpired)
  expect(request.post).toHaveBeenCalledTimes(1)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(request.post).toHaveBeenCalledTimes(2)
  expect(wrapper.find('iframe').exists()).toBe(true)
})
it('aborts an old preview exchange and ignores its late credential after a route change', async () => {
  const pending = deferred<ReturnType<typeof response<PreviewSession>>>()
  vi.mocked(request.post).mockReturnValueOnce(pending.promise)
  const { state, router } = await previewPage()
  const signal = vi.mocked(request.post).mock.calls[0][2]!.signal as AbortSignal
  vi.mocked(request.get).mockRejectedValue(new ApiError('Unavailable', 404))
  await router.push('/preview/p2/v2')
  expect(signal.aborted).toBe(true)
  pending.resolve(response(session()))
  await flushPromises()
  expect(state.data.value).toBeUndefined()
  expect(state.error.value).toBe('Unavailable')
})
it('preserves the owner row and sends only editor/viewer grants and the selected user ID', async () => {
  const { state, changed } = membersDialog()
  await flushPromises()
  await state.save(owner.userId, 'viewer')
  await state.remove(owner)
  expect(request.put).not.toHaveBeenCalled()
  expect(request.remove).not.toHaveBeenCalled()
  state.userId.value = 'u2'
  state.role.value = 'editor'
  await state.save()
  expect(request.put).toHaveBeenCalledWith(
    '/prototype-hub/projects/p1/members/u2',
    { role: 'editor' },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
  expect(changed).toHaveBeenCalledOnce()
})
it('cancels superseded candidate searches immediately and does not refill after closing the dialog', async () => {
  vi.useFakeTimers()
  const old =
    deferred<ReturnType<typeof response<{ userId: string; name: string; username: string }[]>>>()
  const original = vi.mocked(request.get).getMockImplementation()!
  vi.mocked(request.get).mockImplementation((path, ...args) =>
    path.endsWith('/member-candidates') ? old.promise : original(path, ...args),
  )
  const { state, open } = membersDialog()
  const searchCall = vi
    .mocked(request.get)
    .mock.calls.find(([path]) => path.endsWith('/member-candidates'))!
  const signal = searchCall[2]!.signal as AbortSignal
  state.search('another')
  expect(signal.aborted).toBe(true)
  open.value = false
  old.resolve(response([{ userId: 'old', name: 'Old', username: 'old' }]))
  await flushPromises()
  await vi.advanceTimersByTimeAsync(300)
  expect(state.candidates.value).toEqual([])
  expect(state.members.value).toEqual([])
  expect(request.get).toHaveBeenCalledTimes(2)
})
it('clears member identities after permission rejection and skips all member requests without scope', async () => {
  const { state, changed } = membersDialog()
  await flushPromises()
  vi.mocked(request.put).mockRejectedValueOnce(new ApiError('Denied', 403))
  await state.save('u2', 'viewer')
  expect(state.members.value).toEqual([])
  expect(state.candidates.value).toEqual([])
  expect(changed).toHaveBeenCalledOnce()
  vi.mocked(request.get).mockClear()
  membersDialog({ ...project, capabilities: { ...project.capabilities, manageMembers: false } })
  await flushPromises()
  expect(request.get).not.toHaveBeenCalled()
})
it('invalidates a late candidate response when the parallel member scope check is rejected', async () => {
  const pending =
    deferred<ReturnType<typeof response<{ userId: string; name: string; username: string }[]>>>()
  vi.mocked(request.get).mockImplementation((path) =>
    path.endsWith('/member-candidates')
      ? pending.promise
      : Promise.reject(new ApiError('Denied', 403)),
  )
  const { state, changed } = membersDialog()
  await flushPromises()
  pending.resolve(response([{ userId: 'old', name: 'Old', username: 'old' }]))
  await flushPromises()
  expect(state.candidates.value).toEqual([])
  expect(state.members.value).toEqual([])
  expect(state.error.value).toBe('Denied')
  expect(changed).toHaveBeenCalledOnce()
})
it('allows claiming only a pending project through the administrator capability', async () => {
  const { state } = membersDialog({ ...project, role: 'admin', ownerId: null, claimRequired: true })
  await flushPromises()
  state.userId.value = 'u2'
  await state.claim()
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/projects/p1/claim',
    { userId: 'u2' },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  )
})
it('clears old public capability links before a failed share-management refresh', async () => {
  const router = await routerAt('/projects/p1')
  const share = {
    id: 's1',
    projectId: 'p1',
    versionId: 'v1',
    token: 'sensitive-public-grant',
    passwordRequired: false,
    enabled: true,
    createdAt: 1,
    sharePath: '/share/sensitive-public-grant',
  }
  const original = vi.mocked(request.get).getMockImplementation()!
  vi.mocked(request.get).mockImplementation((path, ...args) =>
    path.endsWith('/shares') ? Promise.resolve(response([share])) : original(path, ...args),
  )
  let state!: ReturnType<typeof useShares>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useShares(ref(version), ref(project))
      }),
      { global: { plugins: [router] } },
    ),
  )
  await flushPromises()
  expect(state.resource.data.value).toHaveLength(1)
  vi.mocked(request.get).mockRejectedValueOnce(new ApiError('Denied', 403))
  const refreshing = state.resource.load()
  expect(state.resource.data.value).toEqual([])
  await refreshing
  expect(state.resource.data.value).toEqual([])
  expect(state.resource.error.value).toBe('Denied')
})

it('pins current preview entry, pages and grant to one resolved revision even when version metadata differs', async () => {
  const original = vi.mocked(request.get).getMockImplementation()!
  vi.mocked(request.get).mockImplementation((path, ...args) =>
    path === '/prototype-hub/versions/v1/current-revision'
      ? Promise.resolve(
          response({ ...revision, entryFile: 'old-entry.html', versionName: 'Snapshot name' }),
        )
      : original(path, ...args),
  )
  const { state } = await previewPage()
  expect(state.data.value?.entryFile).toBe('old-entry.html')
  expect(state.data.value?.versionName).toBe('Snapshot name')
  expect(request.get).toHaveBeenCalledWith(
    '/prototype-hub/versions/v1/revisions/r1/pages',
    undefined,
    expect.anything(),
  )
  expect(request.get).not.toHaveBeenCalledWith(
    '/prototype-hub/versions/v1/pages',
    expect.anything(),
    expect.anything(),
  )
  expect(
    vi.mocked(request.get).mock.calls.filter(([path]) => path.endsWith('/current-revision')),
  ).toHaveLength(1)
})

it('opens explicit history by revision query and reloads when only the revision changes', async () => {
  const { state, router } = await previewPage()
  const original = vi.mocked(request.get).getMockImplementation()!
  vi.mocked(request.get)
    .mockClear()
    .mockImplementation((path, ...args) =>
      path === '/prototype-hub/versions/v1/revisions/old'
        ? Promise.resolve(
            response({
              ...revision,
              id: 'old',
              versionName: 'Old snapshot',
              entryFile: 'old.html',
            }),
          )
        : original(path, ...args),
    )
  vi.mocked(request.post).mockClear()
  await router.push('/preview/p1/v1?revisionId=old')
  await flushPromises()
  expect(state.data.value?.entryFile).toBe('old.html')
  expect(state.data.value?.versionName).toBe('Old snapshot')
  expect(request.get).not.toHaveBeenCalledWith(
    '/prototype-hub/versions/v1/current-revision',
    undefined,
    expect.anything(),
  )
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/versions/v1/revisions/old/preview-session',
    undefined,
    expect.anything(),
  )
})

it('keeps legacy versions visible but disables content actions until administrator migration', async () => {
  const original = vi.mocked(request.get).getMockImplementation()!
  const legacy = {
    ...version,
    currentRevisionId: null,
    revisionId: null,
    migrationRequired: true,
    revisionCount: 0,
  }
  const post = vi.mocked(request.post).getMockImplementation()!
  vi.mocked(request.post).mockImplementation((path, ...args) =>
    path === '/prototype-hub/versions/_query'
      ? Promise.resolve(response({ data: [legacy], total: 1, pageIndex: 0, pageSize: 20 }))
      : post(path, ...args),
  )
  vi.mocked(request.get).mockImplementation((path, ...args) =>
    path === '/prototype-hub/versions'
      ? Promise.resolve(response([legacy]))
      : path === '/prototype-hub/versions/v1'
        ? Promise.resolve(response(legacy))
        : original(path, ...args),
  )
  const { wrapper } = await detailPage(() => true, true)
  expect(wrapper.text()).toContain(protoLocales.zh.revisionMigrationRequired)
  for (const label of ['Preview', '上传新修订', '分享管理', '历史修订'])
    expect(wrapper.get(`button[aria-label="${label}"]`).attributes('disabled')).toBeDefined()
  const { state } = await previewPage()
  expect(state.data.value).toBeUndefined()
  expect(state.error.value).toBe(protoLocales.zh.revisionMigrationRequired)
  expect(
    vi.mocked(request.post).mock.calls.filter(([path]) => path.endsWith('/preview-session')),
  ).toHaveLength(0)
})
