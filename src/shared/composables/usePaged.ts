import { ref, watch } from 'vue'
import type { Query, PageResult, RequestOptions } from '@/shared/api/types'
import { useQueryList } from './useQueryList'

/** Compatibility adapter for legacy keyword/extraTerms pages; new pages use useQueryList. */
export function usePaged<T>(
  fetcher: (query: Query, options?: RequestOptions) => Promise<PageResult<T>>,
  searchField = 'name',
  defaults: Pick<Query, 'sorts'> = {},
) {
  const search = ref('')
  const extraTerms = ref<Query['terms']>([])
  const state = useQueryList(fetcher, { defaults })
  function legacyTerms(): Query['terms'] {
    return extraTerms.value?.length
      ? extraTerms.value
      : search.value.trim()
        ? [{ column: searchField, termType: 'like', value: `%${search.value.trim()}%` }]
        : []
  }
  // Keep legacy direct ref assignments effective for load/page, including clearing extra terms.
  watch(
    [search, extraTerms],
    () => (state.queryState.value = { ...state.queryState.value, terms: legacyTerms() }),
    { deep: true, flush: 'sync' },
  )
  async function query() {
    await state.search({ ...state.queryState.value })
  }
  async function searchQuery(value: Query) {
    search.value = ''
    extraTerms.value = []
    await state.search(value)
  }
  async function reset() {
    search.value = ''
    extraTerms.value = []
    await state.reset()
  }
  return { ...state, search, extraTerms, query, searchQuery, reset }
}
