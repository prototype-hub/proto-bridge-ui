import { computed, onMounted, reactive, ref, watch } from 'vue'
import type { PageResult, Query, RequestOptions } from '@/shared/api/types'
import { useResource } from './useResource'

export interface QueryListOptions {
  immediate?: boolean
  pageSize?: number
  defaults?: Query
  beforeQuery?: (query: Query) => Query
}

/** Owns query/pagination state; useResource alone commits the latest, uncancelled response. */
export function useQueryList<T>(
  fetcher: (query: Query, options?: RequestOptions) => Promise<PageResult<T>>,
  options: QueryListOptions = {},
) {
  const pageSize = options.pageSize ?? 20
  const queryState = ref<Query>({ terms: [], ...options.defaults })
  const pagination = reactive({ current: 1, pageSize, total: 0, showSizeChanger: true })
  const requestQuery = computed<Query>(() => {
    const filters = { ...options.defaults, ...queryState.value }
    const transformed = options.beforeQuery ? options.beforeQuery(filters) : filters
    // UI pagination wins even when a saved query or business transform includes old page fields.
    return { ...transformed, pageIndex: pagination.current - 1, pageSize: pagination.pageSize }
  })
  const resource = useResource<PageResult<T>>(
    (signal) => fetcher(requestQuery.value, { signal, silent: true }),
    { data: [], total: 0, pageIndex: 0, pageSize },
  )
  // Observe only committed data: an older load completion must never overwrite a newer total.
  watch(resource.data, (result) => (pagination.total = result.total), { flush: 'sync' })
  watch(queryState, () => (pagination.current = 1), { deep: true, flush: 'sync' })

  async function search(query: Query) {
    queryState.value = { ...query, terms: query.terms || [] }
    pagination.current = 1
    await resource.load()
  }
  async function page(current: number, size: number) {
    pagination.current = size === pagination.pageSize ? current : 1
    pagination.pageSize = size
    await resource.load()
  }
  async function reset() {
    await search({ ...queryState.value, terms: [] })
  }
  onMounted(() => {
    if (options.immediate !== false) void resource.load()
  })
  return { ...resource, pagination, queryState, requestQuery, search, page, reset }
}
