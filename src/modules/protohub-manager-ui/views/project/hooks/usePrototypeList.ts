import { reactive, ref } from 'vue'
import type { PageResult, RequestOptions } from '@/shared/api/types'
import { useResource } from '@/shared/composables/useResource'
import type { PrototypeListQuery, PrototypeListSort } from '@/modules/protohub-manager-ui/types'

/** Owns the two prototype lists' bounded queries, cancellation and one-based UI pagination. */
export function usePrototypeList<T>(
  fetcher: (query: PrototypeListQuery, options: RequestOptions) => Promise<PageResult<T>>,
  beforeLoad: () => void = () => {},
) {
  const keyword = ref('')
  const sort = ref<PrototypeListSort>('createTime:desc')
  const pagination = reactive({
    current: 1,
    pageSize: 20,
    total: 0,
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50'],
    showLessItems: true,
  })
  let submittedKeyword = ''
  const resource = useResource<T[]>(async (signal) => {
    beforeLoad()
    // Queries and failed refreshes must not leave stale rows or counts usable as current scope.
    resource.data.value = []
    pagination.total = 0
    const [sortBy, sortOrder] = sort.value.split(':') as [
      NonNullable<PrototypeListQuery['sortBy']>,
      NonNullable<PrototypeListQuery['sortOrder']>,
    ]
    const query: PrototypeListQuery = {
      pageIndex: pagination.current - 1,
      pageSize: pagination.pageSize,
      keyword: submittedKeyword || undefined,
      sortBy,
      sortOrder,
    }
    const options = { signal, silent: true }
    let result = await fetcher(query, options)
    if (signal.aborted) return []
    const lastPage = Math.max(1, Math.ceil(result.total / pagination.pageSize))
    // A deletion or concurrent removal can empty the final page; requery its current last page once.
    if (pagination.current > lastPage) {
      pagination.current = lastPage
      result = await fetcher({ ...query, pageIndex: lastPage - 1 }, options)
      if (signal.aborted) return []
    }
    pagination.total = result.total
    return result.data
  }, [])

  /** Explicit submit keeps typing local and resets the page before the remote name search. */
  async function search() {
    submittedKeyword = keyword.value.trim()
    pagination.current = 1
    await resource.load()
  }
  async function reset() {
    keyword.value = ''
    await search()
  }
  async function changeSort(value: PrototypeListSort) {
    sort.value = value
    pagination.current = 1
    await resource.load()
  }
  async function page(current: number, size: number) {
    pagination.current = size === pagination.pageSize ? current : 1
    pagination.pageSize = size
    await resource.load()
  }
  /** A new parent scope starts with no inherited filter, sort, page or count. */
  function resetScope() {
    keyword.value = ''
    submittedKeyword = ''
    sort.value = 'createTime:desc'
    pagination.current = 1
    pagination.total = 0
    resource.data.value = []
  }
  return { resource, keyword, sort, pagination, search, reset, changeSort, page, resetScope }
}
