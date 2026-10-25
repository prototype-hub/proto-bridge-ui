import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { h, ref } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { request } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { permissionKey } from '@/shared/auth/provider'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { useVersionRecycle } from '@/modules/protohub-manager-ui/views/recycle/hooks/useVersionRecycle'
import { useProjectDetail } from '@/modules/protohub-manager-ui/views/project/hooks/useProjectDetail'
import RecycleView from '@/modules/protohub-manager-ui/views/recycle/index.vue'
import { useSession } from '@/app/stores/session'
import type { Version } from '@/modules/protohub-manager-ui/types'
import { hookHarness } from '../fixtures/hook-harness'

vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn(), deleted: vi.fn() }))
const version: Version = {
  id: 'v1',
  projectId: 'p1',
  versionName: 'Deleted version',
  entryFile: 'index.html',
  status: 'ready',
  createdBy: 'u1',
  createdAt: 1,
  deletedTime: 2,
  currentRevisionId: 'r1',
  revisionId: 'r1',
  revisionCount: 1,
  migrationRequired: false,
  runtimeBaseUrl: null,
  previewUrl: null,
}
const response = <T>(result: T) => ({ success: true, status: 200, result })
const pageResult = (rows: Version[] = [version]) => ({
  data: rows,
  total: rows.length,
  pageIndex: 0,
  pageSize: 20,
})
const wrappers: VueWrapper[] = []
function renderHook(
  can: (value: string | string[]) => boolean = () => true,
  scope?: string | null,
) {
  const projectId = ref<string | undefined | null>(scope)
  const active = ref(true)
  let state!: ReturnType<typeof useVersionRecycle>
  const wrapper = mount(
    hookHarness(() => {
      state = useVersionRecycle(projectId, active)
    }),
    {
      global: { provide: { [permissionKey]: { can } } },
    },
  )
  wrappers.push(wrapper)
  return { state, projectId, active, wrapper }
}
beforeEach(() => {
  vi.mocked(request.post).mockReset().mockResolvedValue(response(pageResult()))
  vi.mocked(request.get).mockReset()
  i18n.global.locale.value = 'zh'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  i18n.global.mergeLocaleMessage('en', { proto: protoLocales.en })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

it('queries all authorized projects once without a projectId parameter or project lookups', async () => {
  const { state } = renderHook()
  await flushPromises()
  expect(request.post).toHaveBeenCalledExactlyOnceWith(
    '/prototype-hub/versions/_deleted/_query',
    { pageIndex: 0, pageSize: 20, keyword: undefined, sortBy: 'createTime', sortOrder: 'desc' },
    expect.objectContaining({ params: undefined, signal: expect.any(AbortSignal), silent: true }),
  )
  expect(request.get).not.toHaveBeenCalled()
  expect(state.resource.data.value).toEqual([version])
})

it('keeps explicit project scope outside filters and rejects a different project response', async () => {
  const { state } = renderHook(() => true, 'p1')
  await flushPromises()
  expect(request.post).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.any(Object),
    expect.objectContaining({ params: { projectId: 'p1' } }),
  )
  vi.mocked(request.post).mockResolvedValueOnce(
    response(pageResult([{ ...version, projectId: 'other' }])),
  )
  await state.resource.load()
  expect(state.resource.data.value).toEqual([])
  expect(state.resource.error.value).toBe(protoLocales.zh.projectUnavailable)
})

it('does not request or restore without query permission, and rejects an invalid filter without broadening', async () => {
  const { state } = renderHook(() => false)
  await flushPromises()
  await state.restore(version)
  expect(request.post).not.toHaveBeenCalled()
  const invalid = renderHook(() => true, null)
  await flushPromises()
  expect(request.post).not.toHaveBeenCalled()
  expect(invalid.state.resource.error.value).toBe(protoLocales.zh.recycleFilterInvalid)
})

it('requires save permission and the current visible row before restoring', async () => {
  const first = renderHook((value) => value !== 'prototype-hub-version:save')
  await flushPromises()
  await first.state.restore(version)
  const second = renderHook()
  await flushPromises()
  await second.state.restore({ ...version, id: 'foreign' })
  expect(
    vi.mocked(request.post).mock.calls.every(([url]) => url.endsWith('/_deleted/_query')),
  ).toBe(true)
})

it.each([403, 404, 409])(
  'keeps restore %s authoritative without retrying the write',
  async (status) => {
    const { state } = renderHook()
    await flushPromises()
    vi.mocked(request.post).mockImplementation(async (url) => {
      if (url.endsWith('/_restore')) throw new ApiError('Restore refused', status)
      return response(pageResult(status === 409 ? [version] : []))
    })
    await state.restore(version)
    expect(state.task.error.value).toBe('Restore refused')
    expect(state.resource.data.value).toHaveLength(status === 409 ? 1 : 0)
    expect(
      vi.mocked(request.post).mock.calls.filter(([url]) => url.endsWith('/_restore')),
    ).toHaveLength(1)
  },
)

it('aborts and isolates a late query when switching tabs or project scope', async () => {
  let finish!: (value: ReturnType<typeof response<ReturnType<typeof pageResult>>>) => void
  vi.mocked(request.post).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const { state, active, projectId } = renderHook()
  const signal = vi.mocked(request.post).mock.calls[0]![2]!.signal as AbortSignal
  active.value = false
  expect(signal.aborted).toBe(true)
  finish(response(pageResult()))
  await flushPromises()
  expect(state.resource.data.value).toEqual([])
  expect(state.pagination.total).toBe(0)
  projectId.value = 'p1'
  active.value = true
  await flushPromises()
  expect(state.resource.data.value).toEqual([version])
})

it.each(['resolve', 'reject'] as const)(
  'does not refill or poison a changed scope after old restore %s',
  async (outcome) => {
    const { state, active } = renderHook()
    await flushPromises()
    let finish!: () => void
    vi.mocked(request.post).mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finish = () =>
            outcome === 'resolve'
              ? resolve(response(version))
              : reject(new ApiError('Old denial', 403))
        }),
    )
    const pending = state.restore(version)
    active.value = false
    finish()
    await pending
    await flushPromises()
    expect(state.resource.data.value).toEqual([])
    expect(state.task.error.value).toBe('')
  },
)

async function renderPage(grants: string[], path = '/custom/recycle') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/custom/recycle',
        name: 'menu:recycle',
        component: RecycleView,
        meta: { menuComponentCode: 'prototype-hub/Recycle' },
      },
    ],
  })
  await router.push(path)
  const wrapper = mount(RecycleView, {
    global: {
      plugins: [createPinia(), router, i18n],
      provide: {
        [permissionKey]: {
          can: (value: string | string[]) => typeof value === 'string' && grants.includes(value),
        },
      },
      stubs: { ProjectsView: { template: '<div class="project-trash-fixture" />' } },
    },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}
it('defaults a version-only role to its tab without mounting project data or showing restore', async () => {
  const { wrapper } = await renderPage(['prototype-hub-version:query'])
  expect(wrapper.find('.project-trash-fixture').exists()).toBe(false)
  expect(wrapper.findAll('[role="tab"]').map((node) => node.text())).toEqual(['版本回收站'])
  expect(wrapper.text()).toContain('Deleted version')
  expect(wrapper.findAll('button').some((node) => node.text() === '恢复')).toBe(false)
  i18n.global.locale.value = 'en'
  await flushPromises()
  expect(wrapper.find('[role="tab"]').text()).toBe('Version recycle bin')
})
it('shows only project data for a project-only role even with a requested versions tab', async () => {
  const { wrapper } = await renderPage(
    ['prototype-hub-project:query'],
    '/custom/recycle?tab=versions',
  )
  expect(wrapper.find('.project-trash-fixture').exists()).toBe(true)
  expect(wrapper.findAll('[role="tab"]').map((node) => node.text())).toEqual(['项目回收站'])
  expect(request.post).not.toHaveBeenCalled()
})
it('shows a no-permission state with zero data requests rather than an empty project list', async () => {
  const { wrapper } = await renderPage([])
  expect(wrapper.text()).toContain(protoLocales.zh.recycleUnavailable)
  expect(wrapper.findAll('[role="tab"]')).toHaveLength(0)
  expect(wrapper.find('.project-trash-fixture').exists()).toBe(false)
  expect(request.post).not.toHaveBeenCalled()
  expect(request.get).not.toHaveBeenCalled()
})
it.each(['projectId=p1&projectId=p2', 'projectId=%20%20%20', 'projectId=', 'projectId=%00p1'])(
  'rejects invalid project filter %s until the user explicitly clears it',
  async (filter) => {
    const { wrapper, router } = await renderPage(
      ['prototype-hub-version:query'],
      `/custom/recycle?tab=versions&${filter}`,
    )
    expect(request.post).not.toHaveBeenCalled()
    const clear = wrapper
      .findAll('button')
      .find((node) => node.text() === protoLocales.zh.allRecycleProjects)!
    await clear.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.projectId).toBeUndefined()
    expect(request.post).toHaveBeenCalledOnce()
  },
)

it.each([true, false])(
  'compatibly routes old version recycle links only through a granted menu (%s)',
  async (granted) => {
    const pinia = createPinia()
    useSession(pinia).menus = [
      {
        id: 'recycle',
        code: 'custom',
        componentCode: 'prototype-hub/Recycle',
        name: 'Recycle',
        url: '/custom/recycle',
        granted,
      },
    ]
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/projects/:id', name: 'project-detail', component: { render: () => h('div') } },
        { path: '/custom/recycle', name: 'menu:recycle', component: { render: () => h('div') } },
      ],
    })
    await router.push('/projects/p1?recycle=versions')
    let state!: ReturnType<typeof useProjectDetail>
    wrappers.push(
      mount(
        hookHarness(() => {
          state = useProjectDetail()
        }),
        {
          global: {
            plugins: [pinia, router, i18n],
            provide: { [permissionKey]: { can: () => true } },
          },
        },
      ),
    )
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(granted ? '/custom/recycle' : '/projects/p1')
    if (granted)
      expect(router.currentRoute.value.query).toEqual({ tab: 'versions', projectId: 'p1' })
    else expect(state.resource.error.value).toBe(protoLocales.zh.recycleUnavailable)
    expect(request.post).not.toHaveBeenCalled()
    expect(request.get).not.toHaveBeenCalled()
  },
)
