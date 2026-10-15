import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useQueryList, type QueryListOptions } from '@/shared/composables/useQueryList'
import { usePaged } from '@/shared/composables/usePaged'
import type { PageResult, Query, RequestOptions } from '@/shared/api/types'

interface Row {
  id: string
}
type Fetcher = (query: Query, options?: RequestOptions) => Promise<PageResult<Row>>
const result = (id: string, total = 1): PageResult<Row> => ({
  data: [{ id }],
  total,
  pageIndex: 0,
  pageSize: 20,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}
function list(fetcher: Fetcher, options: QueryListOptions = { immediate: false }) {
  let state!: ReturnType<typeof useQueryList<Row>>
  const wrapper = mount(
    // eslint-disable-next-line vue/one-component-per-file -- Local harness exercises hook mount/unmount lifecycle.
    defineComponent({
      setup() {
        state = useQueryList(fetcher, options)
        return () => h('div')
      },
    }),
  )
  return { state, wrapper }
}
describe('query list request ownership', () => {
  it('commits rows and total together and ignores an older response even when it resolves later', async () => {
    const older = deferred<PageResult<Row>>()
    const latest = deferred<PageResult<Row>>()
    const fetcher = vi
      .fn<Fetcher>()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise)
    const { state, wrapper } = list(fetcher)
    const first = state.load()
    const second = state.search({ terms: [{ column: 'name', value: 'latest' }] })
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    latest.resolve(result('latest', 23))
    await second
    expect(state.data.value).toEqual(result('latest', 23))
    expect(state.pagination.total).toBe(23)
    older.resolve(result('older', 999))
    await first
    expect(state.data.value.data).toEqual([{ id: 'latest' }])
    expect(state.pagination.total).toBe(23)
    expect(state.loading.value).toBe(false)
    wrapper.unmount()
  })
  it('aborts on unmount and never commits a result returned by a fetcher that ignores cancellation', async () => {
    const pending = deferred<PageResult<Row>>()
    const fetcher = vi.fn<Fetcher>().mockReturnValue(pending.promise)
    const { state, wrapper } = list(fetcher)
    const request = state.load()
    const signal = fetcher.mock.calls[0]?.[1]?.signal
    wrapper.unmount()
    expect(signal?.aborted).toBe(true)
    pending.resolve(result('unmounted', 84))
    await request
    expect(state.data.value.data).toEqual([])
    expect(state.pagination.total).toBe(0)
  })
  it('keeps the latest request loading when the aborted request completes first', async () => {
    const older = deferred<PageResult<Row>>()
    const latest = deferred<PageResult<Row>>()
    const fetcher = vi
      .fn<Fetcher>()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise)
    const { state, wrapper } = list(fetcher)
    const first = state.load()
    const second = state.load()
    older.resolve(result('older', 99))
    await first
    expect(state.loading.value).toBe(true)
    expect(state.pagination.total).toBe(0)
    latest.resolve(result('current', 5))
    await second
    expect(state.pagination.total).toBe(5)
    wrapper.unmount()
  })
  it('supports an opt-out from mounted loading and passes silent requests with a live signal', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(result('ready'))
    const lazy = list(fetcher)
    expect(fetcher).not.toHaveBeenCalled()
    expect(lazy.state.queryState.value).toEqual({ terms: [] })
    await lazy.state.load()
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      silent: true,
      signal: expect.any(AbortSignal),
    })
    lazy.wrapper.unmount()
    const immediate = list(fetcher, {})
    expect(fetcher).toHaveBeenCalledTimes(2)
    immediate.wrapper.unmount()
  })
})
describe('query list filters and pagination', () => {
  it('preserves complete queries/default sorting and applies fixed pagination after business filters', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(result('row'))
    const { state, wrapper } = list(fetcher, {
      immediate: false,
      pageSize: 5,
      defaults: { sorts: [{ name: 'createTime', order: 'desc' }] },
      beforeQuery: (query) => ({
        ...query,
        pageIndex: 71,
        pageSize: 91,
        terms: [{ terms: query.terms }, { column: 'owner', value: 'iot' }],
      }),
    })
    const filter: Query = {
      paging: false,
      pageIndex: 99,
      pageSize: 90,
      terms: [
        {
          terms: [
            { column: 'status', value: 0 },
            { column: 'name', type: 'or', value: 'demo' },
          ],
        },
      ],
      sorts: [{ name: 'name', order: 'asc' }],
    }
    await state.search(filter)
    expect(state.queryState.value).toEqual(filter)
    expect(fetcher.mock.calls[0]?.[0]).toEqual({
      ...filter,
      pageIndex: 0,
      pageSize: 5,
      terms: [{ terms: filter.terms }, { column: 'owner', value: 'iot' }],
    })
    await state.search({ terms: [] })
    expect(state.requestQuery.value.sorts).toEqual([{ name: 'createTime', order: 'desc' }])
    wrapper.unmount()
  })
  it('resets the current page on search, a page size change, direct query edits and reset', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(result('row'))
    const { state, wrapper } = list(fetcher)
    await state.page(4, 20)
    expect(state.requestQuery.value.pageIndex).toBe(3)
    await state.search({
      terms: [{ column: 'name', value: 'demo' }],
      sorts: [{ name: 'name', order: 'asc' }],
    })
    expect(state.pagination.current).toBe(1)
    await state.page(6, 10)
    expect(state.pagination.current).toBe(1)
    expect(state.requestQuery.value.pageSize).toBe(10)
    await state.page(3, 10)
    state.queryState.value.terms?.push({ column: 'status', value: 0 })
    expect(state.pagination.current).toBe(1)
    await state.page(2, 10)
    await state.reset()
    expect(state.queryState.value.terms).toEqual([])
    expect(state.requestQuery.value.sorts).toEqual([{ name: 'name', order: 'asc' }])
    expect(state.pagination.current).toBe(1)
    wrapper.unmount()
  })
  it('adapts legacy keyword/extraTerms and exposes full-query search without losing sorts', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(result('legacy', 13))
    let state!: ReturnType<typeof usePaged<Row>>
    const wrapper = mount(
      // eslint-disable-next-line vue/one-component-per-file -- Adapter needs its own mounted lifecycle harness.
      defineComponent({
        setup() {
          state = usePaged(fetcher, 'username', { sorts: [{ name: 'createTime', order: 'desc' }] })
          return () => h('div')
        },
      }),
    )
    state.search.value = ' admin '
    await state.query()
    expect(state.requestQuery.value.terms).toEqual([
      { column: 'username', termType: 'like', value: '%admin%' },
    ])
    state.extraTerms.value = [{ column: 'status', termType: 'eq', value: 0 }]
    await state.load()
    expect(state.requestQuery.value.terms).toEqual(state.extraTerms.value)
    state.extraTerms.value = []
    state.search.value = ''
    await state.load()
    expect(state.requestQuery.value.terms).toEqual([])
    const query: Query = {
      paging: false,
      sorts: [{ name: 'name', order: 'asc' }],
      terms: [
        {
          terms: [
            { column: 'a', value: 1 },
            { column: 'b', type: 'or', value: 2 },
          ],
        },
      ],
    }
    await state.searchQuery(query)
    expect(state.queryState.value).toEqual(query)
    await state.query()
    expect(state.queryState.value).toEqual(query)
    await state.page(3, 20)
    expect(state.requestQuery.value).toEqual({ ...query, pageIndex: 2, pageSize: 20 })
    expect(state.data.value.total).toBe(13)
    expect(state.pagination.total).toBe(13)
    wrapper.unmount()
  })
})
