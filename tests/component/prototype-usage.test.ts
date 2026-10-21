import { ownerProjectAccess } from '../fixtures/project-access'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { request } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import type { ApiResponse } from '@/shared/api/types'
import { i18n } from '@/shared/i18n'
import { permissionKey } from '@/shared/auth/provider'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import type { Capacity, Project, VersionUsage } from '@/modules/protohub-manager-ui/types'
import { useProjects } from '@/modules/protohub-manager-ui/views/project/hooks/useProjects'
import { useProjectDetail } from '@/modules/protohub-manager-ui/views/project/hooks/useProjectDetail'
import ProjectsView from '@/modules/protohub-manager-ui/views/project/index.vue'
import ProjectDetailView from '@/modules/protohub-manager-ui/views/project/detail/index.vue'
import CapacityNotice from '@/modules/protohub-manager-ui/views/project/components/CapacityNotice.vue'

vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), put: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn(), deleted: vi.fn() }))
const response = <T>(result: T): ApiResponse<T> => ({ success: true, status: 200, result })
const capacity = (used: number): Capacity => ({
  used,
  limit: 5,
  remaining: Math.max(0, 5 - used),
  overLimit: used > 5,
  canCreate: used < 5,
})
const usageProjectId = (params: unknown) =>
  params && typeof params === 'object' && 'projectId' in params ? params.projectId : undefined
const project: Project = {
  id: 'p1',
  name: 'Existing project',
  createdBy: 'admin',
  createdAt: 1,
  updatedAt: 1,
  ...ownerProjectAccess,
}
const mounted: VueWrapper[] = []

async function render(page: 'projects' | 'detail', actualPage = false) {
  let projects!: ReturnType<typeof useProjects>
  let detail!: ReturnType<typeof useProjectDetail>
  const harness = defineComponent({
    setup() {
      if (page === 'projects') projects = useProjects()
      else detail = useProjectDetail()
      return () => h('div')
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/prototype-hub', name: 'projects', component: { render: () => h('div') } },
      {
        path: '/prototype-hub/projects/:id',
        name: 'project-detail',
        component: { render: () => h('div') },
      },
    ],
  })
  await router.push(page === 'projects' ? '/prototype-hub' : '/prototype-hub/projects/p1')
  const wrapper = mount(
    actualPage ? (page === 'projects' ? ProjectsView : ProjectDetailView) : harness,
    {
      global: {
        plugins: [createPinia(), router, i18n],
        provide: { [permissionKey]: { can: () => true } },
        stubs: { ProjectDialog: true, UploadDialog: true, ShareDialog: true },
      },
    },
  )
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, router, projects, detail }
}

beforeEach(() => {
  vi.mocked(request.get).mockReset()
  vi.mocked(request.post).mockReset()
  vi.mocked(request.put).mockReset()
  vi.mocked(request.remove).mockReset()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
  vi.mocked(request.get).mockImplementation(async (path, params) => {
    if (path === '/prototype-hub/projects') return response([project])
    if (path === '/prototype-hub/projects/_usage')
      return response({ installationId: 'private-installation', projects: capacity(1) })
    if (path === '/prototype-hub/versions/_usage')
      return response({ projectId: usageProjectId(params), versions: capacity(1) })
    if (path === '/prototype-hub/versions')
      return response([
        { id: 'v1', projectId: 'p1', versionName: 'V1', status: 'ready', createdAt: 1 },
      ])
    return response(project)
  })
  vi.mocked(request.post).mockResolvedValue(response(project))
  vi.mocked(request.remove).mockResolvedValue(response(true))
})
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

it('keeps existing projects visible while usage is pending, and treats failed usage as unknown', async () => {
  let reject!: (cause: unknown) => void
  const original = vi.mocked(request.get).getMockImplementation()!
  vi.mocked(request.get).mockImplementation((path, ...args) =>
    path.endsWith('/_usage')
      ? new Promise((_resolve, fail) => {
          reject = fail
        })
      : original(path, ...args),
  )
  const { wrapper } = await render('projects', true)
  expect(wrapper.text()).toContain(project.name)
  expect(wrapper.text()).toContain('正在获取用量')
  reject(new ApiError('Usage unavailable', 503))
  await flushPromises()
  expect(wrapper.text()).toContain(project.name)
  expect(wrapper.text()).toContain(protoLocales.zh.capacity.unavailable)
  expect(wrapper.text()).not.toContain('0 / 5')
  expect(wrapper.text()).not.toContain('private-installation')
  expect(
    wrapper
      .findAll('button')
      .find((button) => button.text() === '新建项目')
      ?.attributes('disabled'),
  ).toBeUndefined()
  vi.mocked(request.get).mockImplementation(original)
  await wrapper.getComponent(CapacityNotice).get('button').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('项目用量：1 / 5')
})

it('blocks only new projects at capacity and retains edit/delete actions for existing projects', async () => {
  const original = vi.mocked(request.get).getMockImplementation()!
  vi.mocked(request.get).mockImplementation((path, ...args) =>
    path.endsWith('/_usage')
      ? Promise.resolve(response({ installationId: 'private-installation', projects: capacity(7) }))
      : original(path, ...args),
  )
  const { wrapper } = await render('projects', true)
  expect(wrapper.text()).toContain('项目用量：7 / 5')
  expect(wrapper.text()).toContain(protoLocales.zh.capacity.overLimit)
  expect(
    wrapper
      .findAll('button')
      .find((button) => button.text() === '新建项目')
      ?.attributes('disabled'),
  ).toBeDefined()
  expect(wrapper.find('button[aria-label="编辑"]').attributes('disabled')).toBeUndefined()
  expect(wrapper.find('button[aria-label="删除"]').attributes('disabled')).toBeUndefined()
})

it('retains version preview/replacement/deletion when no new version can be uploaded', async () => {
  const original = vi.mocked(request.get).getMockImplementation()!
  vi.mocked(request.get).mockImplementation((path, ...args) =>
    path === '/prototype-hub/versions/_usage'
      ? Promise.resolve(response({ projectId: 'p1', versions: capacity(5) }))
      : original(path, ...args),
  )
  const { wrapper } = await render('detail', true)
  expect(wrapper.text()).toContain('当前项目版本用量：5 / 5')
  expect(
    wrapper
      .findAll('button')
      .find((button) => button.text() === '上传版本')
      ?.attributes('disabled'),
  ).toBeDefined()
  for (const label of ['Preview', '更新版本', '删除'])
    expect(wrapper.find(`button[aria-label="${label}"]`).attributes('disabled')).toBeUndefined()
})

it('cancels old project usage and ignores a late result after changing projects', async () => {
  let oldSignal!: AbortSignal
  let resolveOld!: (result: ApiResponse<VersionUsage>) => void
  const original = vi.mocked(request.get).getMockImplementation()!
  vi.mocked(request.get).mockImplementation((path, params, options) => {
    if (path === '/prototype-hub/versions/_usage' && usageProjectId(params) === 'p1') {
      oldSignal = options!.signal as AbortSignal
      return new Promise((resolve) => {
        resolveOld = resolve
      })
    }
    return original(path, params, options)
  })
  const { detail, router } = await render('detail')
  expect(detail.usage.data.value).toBeUndefined()
  await router.push('/prototype-hub/projects/p2')
  await flushPromises()
  expect(oldSignal.aborted).toBe(true)
  expect(detail.usage.data.value?.projectId).toBe('p2')
  resolveOld(response({ projectId: 'p1', versions: capacity(9) }))
  await flushPromises()
  expect(detail.usage.data.value?.projectId).toBe('p2')
  expect(detail.usage.data.value?.versions.used).toBe(1)
})

it('refreshes project usage after successful creation and deletion', async () => {
  const { projects } = await render('projects')
  projects.edit()
  await projects.save({ name: 'New project' })
  await projects.remove('p1')
  expect(
    vi.mocked(request.get).mock.calls.filter(([path]) => path === '/prototype-hub/projects/_usage'),
  ).toHaveLength(3)
})

it('refreshes version usage after deleting an existing version', async () => {
  const { detail } = await render('detail')
  await detail.remove('v1')
  expect(
    vi.mocked(request.get).mock.calls.filter(([path]) => path === '/prototype-hub/versions/_usage'),
  ).toHaveLength(2)
})
