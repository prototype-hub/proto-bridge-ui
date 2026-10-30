import { ownerProjectAccess } from '../fixtures/project-access'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
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
import { useVersionRecycle } from '@/modules/protohub-manager-ui/views/recycle/hooks/useVersionRecycle'
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

async function render(
  page: 'projects' | 'detail' | 'versions',
  actualPage = false,
  can: (value: string | string[]) => boolean = () => true,
  recycled = false,
) {
  let projects!: ReturnType<typeof useProjects>
  let detail!: ReturnType<typeof useProjectDetail>
  let recycle!: ReturnType<typeof useVersionRecycle>
  const harness = defineComponent({
    setup() {
      if (page === 'projects') projects = useProjects()
      else if (page === 'versions') recycle = useVersionRecycle(ref('p1'), ref(true))
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
      props: actualPage && page === 'projects' ? { recycled } : {},
      global: {
        plugins: [createPinia(), router, i18n],
        provide: { [permissionKey]: { can } },
        stubs: { ProjectDialog: true, UploadDialog: true, ShareDialog: true },
      },
    },
  )
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, router, projects, detail, recycle }
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
        {
          id: 'v1',
          projectId: 'p1',
          versionName: 'V1',
          status: 'ready',
          createdAt: 1,
          currentRevisionId: 'r1',
          revisionId: 'r1',
          revisionCount: 1,
          migrationRequired: false,
        },
      ])
    return response(project)
  })
  vi.mocked(request.post).mockImplementation(async (path) => {
    if (path === '/prototype-hub/projects/_query')
      return response({ data: [project], total: 1, pageIndex: 0, pageSize: 20 })
    if (path === '/prototype-hub/versions/_query') {
      return response({
        data: [
          {
            id: 'v1',
            projectId: 'p1',
            versionName: 'V1',
            status: 'ready',
            createdAt: 1,
            currentRevisionId: 'r1',
            revisionId: 'r1',
            revisionCount: 1,
            migrationRequired: false,
          },
        ],
        total: 1,
        pageIndex: 0,
        pageSize: 20,
      })
    }
    return response(project)
  })
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
  expect(
    wrapper
      .findAll('button')
      .find((button) => button.text() === '新建项目')
      ?.attributes('disabled'),
  ).toBeDefined()
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
  ).toBeDefined()
  vi.mocked(request.get).mockImplementation(original)
  await wrapper.getComponent(CapacityNotice).get('.ant-alert button').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('已用 1 / 5')
})

it('blocks only new projects at capacity and retains edit/delete actions for existing projects', async () => {
  const original = vi.mocked(request.get).getMockImplementation()!
  vi.mocked(request.get).mockImplementation((path, ...args) =>
    path.endsWith('/_usage')
      ? Promise.resolve(response({ installationId: 'private-installation', projects: capacity(7) }))
      : original(path, ...args),
  )
  const { wrapper } = await render('projects', true)
  expect(wrapper.text()).toContain('已用 7 / 5')
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
  expect(wrapper.text()).toContain('已用 5 / 5')
  expect(
    wrapper
      .findAll('button')
      .find((button) => button.text() === '上传版本')
      ?.attributes('disabled'),
  ).toBeDefined()
  for (const label of ['预览', '上传新修订', '删除'])
    expect(wrapper.find(`button[aria-label="${label}"]`).attributes('disabled')).toBeUndefined()
})

it.each(['projects', 'detail'] as const)(
  'shows unlimited %s usage and follows server admission instead of comparing counts',
  async (kind) => {
    const original = vi.mocked(request.get).getMockImplementation()!
    const unlimited: Capacity = {
      used: 12,
      limit: -1,
      remaining: -1,
      overLimit: false,
      canCreate: true,
    }
    vi.mocked(request.get).mockImplementation((path, ...args) =>
      path.endsWith('/_usage')
        ? Promise.resolve(
            response(
              kind === 'projects'
                ? { installationId: 'private-installation', projects: unlimited }
                : { projectId: 'p1', versions: unlimited },
            ),
          )
        : original(path, ...args),
    )
    const { wrapper } = await render(kind, true)
    expect(wrapper.getComponent(CapacityNotice).text()).toContain('已用 12 / 不限')
    expect(wrapper.getComponent(CapacityNotice).text()).not.toContain('-1')
    expect(wrapper.getComponent(CapacityNotice).text()).not.toContain(protoLocales.zh.capacity.full)
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text() === (kind === 'projects' ? '新建项目' : '上传版本'))
        ?.attributes('disabled'),
    ).toBeUndefined()
  },
)

it('does not grant version creation from an unlimited allowance to a project viewer', async () => {
  const original = vi.mocked(request.get).getMockImplementation()!
  vi.mocked(request.get).mockImplementation((path, ...args) => {
    if (path === '/prototype-hub/versions/_usage')
      return Promise.resolve(
        response({
          projectId: 'p1',
          versions: {
            used: 12,
            limit: -1,
            remaining: -1,
            overLimit: false,
            canCreate: true,
          },
        }),
      )
    if (path === '/prototype-hub/projects/p1')
      return Promise.resolve(
        response({
          ...project,
          role: 'viewer',
          capabilities: {
            read: true,
            edit: false,
            deleteProject: false,
            manageMembers: false,
            manageShares: false,
          },
        }),
      )
    return original(path, ...args)
  })
  const { wrapper } = await render('detail', true)
  expect(wrapper.text()).toContain('已用 12 / 不限')
  expect(wrapper.findAll('button').find((button) => button.text() === '上传版本')).toBeUndefined()
  expect(wrapper.find('button[aria-label="预览"]').exists()).toBe(true)
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

it.each(['projects', 'detail'] as const)(
  'releases %s usage after deletion while retaining the server limit',
  async (kind) => {
    let removed = false
    const original = vi.mocked(request.get).getMockImplementation()!
    vi.mocked(request.get).mockImplementation((path, ...args) =>
      path.endsWith('/_usage')
        ? Promise.resolve(
            response(
              kind === 'projects'
                ? { installationId: 'private-installation', projects: capacity(removed ? 4 : 5) }
                : { projectId: 'p1', versions: capacity(removed ? 4 : 5) },
            ),
          )
        : original(path, ...args),
    )
    vi.mocked(request.remove).mockImplementation(async () => {
      removed = true
      return response(true)
    })
    const { projects, detail } = await render(kind)
    const state = kind === 'projects' ? projects : detail
    const current = () =>
      kind === 'projects' ? projects.usage.data.value?.projects : detail.usage.data.value?.versions
    expect(current()).toMatchObject({ used: 5, limit: 5, canCreate: false })
    await state.remove(kind === 'projects' ? 'p1' : 'v1')
    expect(current()).toMatchObject({ used: 4, limit: 5, remaining: 1, canCreate: true })
  },
)

it.each(['projects', 'detail'] as const)(
  'clears a concurrently deleted %s row on 404 without hiding the real denial',
  async (kind) => {
    const { projects, detail } = await render(kind)
    const state = kind === 'projects' ? projects : detail
    vi.mocked(request.remove).mockRejectedValueOnce(new ApiError('Resource unavailable', 404))
    vi.mocked(request.post).mockResolvedValue(
      response({ data: [], total: 0, pageIndex: 0, pageSize: 20 }),
    )
    await state.remove(kind === 'projects' ? 'p1' : 'v1')
    expect(state.task.error.value).toBe('Resource unavailable')
    expect(
      kind === 'projects' ? projects.resource.data.value : detail.resource.data.value.versions,
    ).toEqual([])
    expect(state.pagination.total).toBe(0)
    expect(
      vi.mocked(request.get).mock.calls.filter(([path]) => path.endsWith('/_usage')),
    ).toHaveLength(2)
  },
)

it.each(['projects', 'versions'] as const)(
  'restores %s through its scoped endpoint and refreshes the owning list',
  async (kind) => {
    let restored = false
    const original = vi.mocked(request.post).getMockImplementation()!
    vi.mocked(request.post).mockImplementation(async (path, ...args) => {
      if (path.endsWith('/_deleted/_query'))
        return response({
          data: restored
            ? []
            : [
                kind === 'projects'
                  ? { ...project, deletedTime: Date.now() }
                  : { id: 'v1', projectId: 'p1', deletedTime: Date.now() },
              ],
          total: restored ? 0 : 1,
          pageIndex: 0,
          pageSize: 20,
        })
      if (path.endsWith('/_restore')) {
        restored = true
        return response(project)
      }
      return original(path, ...args)
    })
    const { projects, recycle } = await render(kind)
    const state = kind === 'projects' ? projects : recycle
    if (kind === 'projects') projects.trash.value = true
    await flushPromises()
    const row =
      kind === 'projects' ? projects.resource.data.value[0]! : recycle.resource.data.value[0]!
    if (kind === 'projects') await projects.restore(row as Project)
    else await recycle.restore(row as (typeof recycle.resource.data.value)[number])
    expect(request.post).toHaveBeenCalledWith(
      `/prototype-hub/${kind === 'projects' ? 'projects/p1' : 'versions/v1'}/_restore`,
      undefined,
      kind === 'projects' ? undefined : { silent: true },
    )
    expect(state.pagination.total).toBe(0)
    expect(
      vi.mocked(request.get).mock.calls.filter(([path]) => path.endsWith('/_usage')),
    ).toHaveLength(kind === 'projects' ? 3 : 0)
  },
)

it.each([
  ['projects', 409],
  ['projects', 404],
  ['versions', 409],
  ['versions', 404],
] as const)(
  'keeps %s restore errors authoritative (%s), refreshing expired tombstones and usage on 404',
  async (kind, status) => {
    let refused = false
    const original = vi.mocked(request.post).getMockImplementation()!
    vi.mocked(request.post).mockImplementation(async (path, ...args) => {
      if (path.endsWith('/_deleted/_query')) {
        const missing = refused && status === 404
        return response({
          data: missing
            ? []
            : [
                kind === 'projects'
                  ? { ...project, deletedTime: Date.now() }
                  : { id: 'v1', projectId: 'p1', deletedTime: Date.now() },
              ],
          total: missing ? 0 : 1,
          pageIndex: 0,
          pageSize: 20,
        })
      }
      if (path.endsWith('/_restore')) {
        refused = true
        throw new ApiError('Restore refused', status)
      }
      return original(path, ...args)
    })
    const { projects, recycle } = await render(kind)
    const state = kind === 'projects' ? projects : recycle
    if (kind === 'projects') projects.trash.value = true
    await flushPromises()
    const before = vi.mocked(request.post).mock.calls.length
    const usageBefore = vi
      .mocked(request.get)
      .mock.calls.filter(([path]) => path.endsWith('/_usage')).length
    if (kind === 'projects') await projects.restore(projects.resource.data.value[0]!)
    else await recycle.restore(recycle.resource.data.value[0]!)
    expect(state.task.error.value).toBe('Restore refused')
    const rows = kind === 'projects' ? projects.resource.data.value : recycle.resource.data.value
    expect(rows.map((row) => row.id)).toEqual(
      status === 404 ? [] : [kind === 'projects' ? 'p1' : 'v1'],
    )
    expect(state.pagination.total).toBe(status === 404 ? 0 : 1)
    expect(vi.mocked(request.post).mock.calls.length - before).toBe(status === 404 ? 2 : 1)
    expect(
      vi.mocked(request.get).mock.calls.filter(([path]) => path.endsWith('/_usage')).length -
        usageBefore,
    ).toBe(status === 404 && kind === 'projects' ? 1 : 0)
  },
)

it.each(['resolve', 'reject'] as const)(
  'does not close or poison a reopened project form after an old save %s',
  async (outcome) => {
    const { projects } = await render('projects')
    let resolve!: (value: ApiResponse<Project>) => void
    let reject!: (cause: Error) => void
    const pending = new Promise<ApiResponse<Project>>((done, fail) => {
      resolve = done
      reject = fail
    })
    vi.mocked(request.post).mockReturnValueOnce(pending)
    projects.edit()
    const saving = projects.save({ name: 'Old form' })
    projects.open.value = false
    projects.edit()
    projects.form.value.name = 'New draft'
    if (outcome === 'resolve') resolve(response(project))
    else reject(new ApiError('Old save failed', 500))
    await saving
    expect(projects.open.value).toBe(true)
    expect(projects.form.value.name).toBe('New draft')
    expect(projects.task.error.value).toBe('')
  },
)

it.each(['resolve', 'reject'] as const)(
  'does not refresh or poison a different project after an old delete %s',
  async (outcome) => {
    const { detail, router } = await render('detail')
    let resolve!: (value: ApiResponse<boolean>) => void
    let reject!: (cause: Error) => void
    vi.mocked(request.remove).mockReturnValueOnce(
      new Promise((done, fail) => {
        resolve = done
        reject = fail
      }),
    )
    const deleting = detail.remove('v1')
    const original = vi.mocked(request.get).getMockImplementation()!
    vi.mocked(request.get).mockImplementation((path, ...args) =>
      path === '/prototype-hub/projects/p2'
        ? Promise.resolve(response({ ...project, id: 'p2' }))
        : original(path, ...args),
    )
    vi.mocked(request.post).mockResolvedValue(
      response({ data: [], total: 0, pageIndex: 0, pageSize: 20 }),
    )
    await router.push('/prototype-hub/projects/p2')
    await flushPromises()
    const queries = vi.mocked(request.post).mock.calls.length
    if (outcome === 'resolve') resolve(response(true))
    else reject(new ApiError('Old delete failed', 404))
    await deleting
    expect(detail.resource.data.value.project?.id).toBe('p2')
    expect(detail.task.error.value).toBe('')
    expect(vi.mocked(request.post).mock.calls).toHaveLength(queries)
  },
)

it('hides project restore without the save action even when the server reports owner capabilities', async () => {
  const original = vi.mocked(request.post).getMockImplementation()!
  vi.mocked(request.post).mockImplementation(async (path, ...args) =>
    path.endsWith('/_deleted/_query')
      ? response({
          data: [{ ...project, deletedTime: Date.now() }],
          total: 1,
          pageIndex: 0,
          pageSize: 20,
        })
      : original(path, ...args),
  )
  const { wrapper } = await render(
    'projects',
    true,
    (value) => value !== 'prototype-hub-project:save',
    true,
  )
  await flushPromises()
  expect(wrapper.text()).toContain(project.name)
  expect(wrapper.find('button[aria-label="恢复"]').exists()).toBe(false)
})

it('does not expose the version recycle bin to a viewer despite global action grants', async () => {
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
              deleteProject: false,
              manageMembers: false,
              manageShares: false,
            },
          }),
        )
      : original(path, ...args),
  )
  const { wrapper } = await render('detail', true)
  expect(wrapper.text()).not.toContain('回收站')
  expect(wrapper.find('button[aria-label="恢复"]').exists()).toBe(false)
})
