import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import { usePrototypeList } from '@/modules/protohub-manager-ui/views/project/hooks/usePrototypeList'
import { useProjectDetail } from '@/modules/protohub-manager-ui/views/project/hooks/useProjectDetail'
import { request } from '@/shared/api/client'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import type { PrototypeListQuery, Project, Version } from '@/modules/protohub-manager-ui/types'
import { permissionKey } from '@/shared/auth/provider'
import { ownerProjectAccess } from '../fixtures/project-access'

vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), put: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn(), deleted: vi.fn() }))

const wrappers: VueWrapper[] = []
const pageResult = <T>(data: T[], total = data.length): PageResult<T> => ({
  data,
  total,
  pageIndex: 0,
  pageSize: 20,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}
function renderList(
  fetcher: (query: PrototypeListQuery, options: RequestOptions) => Promise<PageResult<string>>,
) {
  let list!: ReturnType<typeof usePrototypeList<string>>
  const wrapper = mount(
    defineComponent({
      setup() {
        list = usePrototypeList(fetcher)
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)
  return { list, wrapper }
}
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.resetAllMocks()
})

it('submits trimmed literal names only on search, resetting page and preserving the selected sort', async () => {
  const fetcher = vi.fn<
    (query: PrototypeListQuery, options: RequestOptions) => Promise<PageResult<string>>
  >(async () => pageResult(['first'], 45))
  const { list } = renderList(fetcher)
  await list.resource.load()
  expect(fetcher.mock.calls[0][0]).toMatchObject({
    pageIndex: 0,
    pageSize: 20,
    sortBy: 'createTime',
    sortOrder: 'desc',
  })
  list.keyword.value = '  100%_\\中文  '
  expect(fetcher).toHaveBeenCalledTimes(1)
  await list.page(3, 20)
  await list.changeSort('name:asc')
  expect(list.pagination.current).toBe(1)
  await list.page(2, 20)
  await list.search()
  expect(fetcher.mock.calls.at(-1)?.[0]).toEqual({
    pageIndex: 0,
    pageSize: 20,
    keyword: '100%_\\中文',
    sortBy: 'name',
    sortOrder: 'asc',
  })
  await list.page(2, 50)
  expect(list.pagination.current).toBe(1)
  await list.resource.load()
  expect(fetcher.mock.calls.at(-1)?.[0]).toMatchObject({ keyword: '100%_\\中文', pageSize: 50 })
  await list.reset()
  expect(list.keyword.value).toBe('')
  expect(fetcher.mock.calls.at(-1)?.[0].keyword).toBeUndefined()
})

it('aborts earlier queries and clears rows/count immediately while ignoring a late response', async () => {
  const old = deferred<PageResult<string>>()
  const fetcher = vi
    .fn<(query: PrototypeListQuery, options: RequestOptions) => Promise<PageResult<string>>>()
    .mockResolvedValueOnce(pageResult(['visible'], 41))
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(pageResult(['new'], 1))
  const { list } = renderList(fetcher)
  await list.resource.load()
  const loading = list.page(2, 20)
  const signal = fetcher.mock.calls[1][1].signal as AbortSignal
  expect(list.resource.data.value).toEqual([])
  expect(list.pagination.total).toBe(0)
  list.keyword.value = 'new'
  await list.search()
  expect(signal.aborted).toBe(true)
  old.resolve(pageResult(['private old'], 95))
  await loading
  expect(list.resource.data.value).toEqual(['new'])
  expect(list.pagination.total).toBe(1)
  expect(list.pagination.current).toBe(1)
})

it('clamps a deleted final page and requeries once while retaining its keyword and stable sort', async () => {
  const fetcher = vi
    .fn<(query: PrototypeListQuery, options: RequestOptions) => Promise<PageResult<string>>>()
    .mockResolvedValueOnce(pageResult(['last'], 21))
    .mockResolvedValueOnce(pageResult([], 20))
    .mockResolvedValueOnce(pageResult(['remaining'], 20))
  const { list } = renderList(fetcher)
  list.keyword.value = 'match'
  await list.search()
  await list.page(2, 20)
  expect(fetcher.mock.calls.slice(-2).map(([query]) => query.pageIndex)).toEqual([1, 0])
  expect(fetcher.mock.calls.at(-1)?.[0]).toMatchObject({
    keyword: 'match',
    sortBy: 'createTime',
    sortOrder: 'desc',
  })
  expect(list.pagination.current).toBe(1)
  expect(list.pagination.total).toBe(20)
  expect(list.resource.data.value).toEqual(['remaining'])
})

it('keeps failed refreshes empty and aborts in-flight data when its owner unmounts', async () => {
  const pending = deferred<PageResult<string>>()
  const fetcher = vi
    .fn<(query: PrototypeListQuery, options: RequestOptions) => Promise<PageResult<string>>>()
    .mockResolvedValueOnce(pageResult(['old'], 5))
    .mockRejectedValueOnce(new Error('Denied'))
    .mockReturnValueOnce(pending.promise)
  const { list, wrapper } = renderList(fetcher)
  await list.resource.load()
  await list.resource.load()
  expect(list.resource.error.value).toBe('Denied')
  expect(list.resource.data.value).toEqual([])
  expect(list.pagination.total).toBe(0)
  const loading = list.resource.load()
  const signal = fetcher.mock.calls.at(-1)![1].signal as AbortSignal
  wrapper.unmount()
  expect(signal.aborted).toBe(true)
  pending.resolve(pageResult(['late'], 5))
  await loading
  expect(list.resource.data.value).toEqual([])
  expect(list.pagination.total).toBe(0)
})

it('isolates a late paged version response after changing parent project and resets all list controls', async () => {
  const project = (id: string): Project => ({
    id,
    name: id,
    createdBy: 'owner',
    createdAt: 1,
    updatedAt: 1,
    ...ownerProjectAccess,
  })
  const pending = deferred<{ success: boolean; status: number; result: PageResult<Version> }>()
  vi.mocked(request.get).mockImplementation(async (url) => ({
    success: true,
    status: 200,
    result: url.endsWith('_usage')
      ? { projectId: 'p2', versions: {} }
      : project(url.split('/').at(-1)!),
  }))
  vi.mocked(request.post)
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue({
      success: true,
      status: 200,
      result: pageResult([{ id: 'v2', projectId: 'p2' } as Version]),
    })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/projects/:id', component: { render: () => h('div') } }],
  })
  await router.push('/projects/p1')
  let state!: ReturnType<typeof useProjectDetail>
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          state = useProjectDetail()
          return () => h('div')
        },
      }),
      {
        global: {
          plugins: [router, createPinia()],
          provide: { [permissionKey]: { can: () => true } },
        },
      },
    ),
  )
  await flushPromises()
  const signal = vi.mocked(request.post).mock.calls[0][2]!.signal as AbortSignal
  state.search.value = 'old draft'
  state.pagination.current = 3
  state.sort.value = 'name:desc'
  state.membersOpen.value = true
  await router.push('/projects/p2')
  expect(signal.aborted).toBe(true)
  expect(state.resource.data.value.project).toBeUndefined()
  expect(state.pagination.total).toBe(0)
  expect(state.membersOpen.value).toBe(false)
  await flushPromises()
  expect(state.search.value).toBe('')
  expect(state.sort.value).toBe('createTime:desc')
  pending.resolve({
    success: true,
    status: 200,
    result: pageResult([{ id: 'v1', projectId: 'p1' } as Version], 99),
  })
  await flushPromises()
  expect(state.resource.data.value.project?.id).toBe('p2')
  expect(state.resource.data.value.versions.map((version) => version.id)).toEqual(['v2'])
  expect(state.pagination.total).toBe(1)
})
