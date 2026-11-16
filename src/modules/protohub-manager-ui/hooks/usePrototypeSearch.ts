import { computed, ref, watch, type Ref } from 'vue'
import { useSession } from '@/app/stores/session'
import { useResource } from '@/shared/composables/useResource'
import { t } from '@/shared/i18n'
import { prototypeSearchApi } from '../api/search'
import { protoPermissions } from '../routes/permissions'
import type { PrototypeSearchPage, SearchScope, SearchType } from '../types/search'

/** One submitted keyword owns its server page; scope/identity changes discard prior results. */
export function usePrototypeSearch(scope: Readonly<Ref<SearchScope | null>>) {
  const session = useSession()
  const keyword = ref(''),
    submitted = ref(''),
    invalid = ref('')
  const type = ref<SearchType>('COPY'),
    pageIndex = ref(0),
    pageSize = ref(20)
  const canQuery = computed(() => session.can(protoPermissions.version.query))
  const resource = useResource<PrototypeSearchPage | undefined>(async (signal) => {
    resource.data.value = undefined
    if (!canQuery.value || scope.value === null || !submitted.value) return undefined
    return prototypeSearchApi.query(
      {
        ...scope.value,
        type: type.value,
        keyword: submitted.value,
        pageIndex: pageIndex.value,
        pageSize: pageSize.value,
      },
      { signal, silent: true },
    )
  }, undefined)
  function submit() {
    const value = keyword.value.trim()
    invalid.value = value.length < 1 || value.length > 100 ? t('proto.searchInvalidKeyword') : ''
    if (invalid.value) return false
    submitted.value = value
    pageIndex.value = 0
    void resource.load()
    return true
  }
  function paginate(page: number, size: number) {
    pageIndex.value = size === pageSize.value ? page - 1 : 0
    pageSize.value = size
    void resource.load()
  }
  watch(
    keyword,
    () => {
      invalid.value = ''
    },
    { flush: 'sync' },
  )
  watch(type, () => {
    pageIndex.value = 0
    void resource.load()
  })
  watch(scope, () => {
    pageIndex.value = 0
    void resource.load()
  })
  watch(
    [() => session.user?.id, () => [...session.permissions].sort().join(',')],
    () => {
      keyword.value = submitted.value = invalid.value = ''
      pageIndex.value = 0
      resource.data.value = undefined
      void resource.load()
    },
    { flush: 'sync' },
  )
  return {
    keyword,
    submitted,
    invalid,
    type,
    pageIndex,
    pageSize,
    canQuery,
    resource,
    submit,
    paginate,
  }
}
