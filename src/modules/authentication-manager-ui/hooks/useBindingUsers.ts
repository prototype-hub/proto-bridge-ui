import type { BindingScope } from '@/modules/authentication-manager-ui/types/membership'
export type { BindingScope } from '@/modules/authentication-manager-ui/types/membership'
import { ref, computed, watch, toValue, type MaybeRefOrGetter } from 'vue'
import type { Query, QueryTerm } from '@/shared/api/types'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import { recordsOf, resultOf, isRecord } from '@/modules/authentication-manager-ui/utils/model'
import { request } from '@/shared/api/client'
import { useQueryList } from '@/shared/composables/useQueryList'
import { organizationMemberTerms } from '@/modules/authentication-manager-ui/utils/organization'
import { scopedQueryTerms } from '@/modules/authentication-manager-ui/utils/query-scope'
export function memberTerms(scope: BindingScope, candidate = false): QueryTerm[] {
  if (candidate)
    return [
      { column: `id$in-dimension$${scope.type}$not`, value: scope.id },
      ...(scope.type === 'position'
        ? [{ column: 'username', termType: 'not', value: 'admin', type: 'and' as const }]
        : []),
    ]
  return [
    ...(scope.type === 'org'
      ? organizationMemberTerms(scope.id)
      : [{ column: `id$in-dimension$${scope.type}`, value: scope.id }]),
    ...(scope.positionId ? [{ column: 'id$in-dimension$position', value: scope.positionId }] : []),
  ]
}
export function useBindingUsers(source: MaybeRefOrGetter<BindingScope>, candidate = false) {
  const positionFilter = ref('')
  const list = useQueryList<SystemRecord>(
    async (query, options) => {
      const scope = toValue(source)
      if (!scope.id)
        return {
          data: [],
          total: 0,
          pageIndex: query.pageIndex || 0,
          pageSize: query.pageSize || 12,
        }
      const response = await request.post(
        candidate || scope.type !== 'role' ? '/user/detail/_query' : '/user/_query/',
        {
          ...query,
          sorts: [{ name: 'createTime', order: 'desc' }],
          terms: scopedQueryTerms(
            query.terms,
            memberTerms({ ...scope, positionId: positionFilter.value }, candidate),
          ),
        },
        options,
      )
      const result = resultOf(response)
      const rows = recordsOf(response)
      return {
        data: rows,
        total: isRecord(result) && typeof result.total === 'number' ? result.total : rows.length,
        pageIndex: query.pageIndex || 0,
        pageSize: query.pageSize || 12,
      }
    },
    { immediate: false, pageSize: 12 },
  )
  async function search(value: Query) {
    if (!value.terms?.length) positionFilter.value = ''
    await list.search(value)
  }
  async function clearPositionFilter() {
    positionFilter.value = ''
    list.pagination.current = 1
    await list.load()
  }
  if (!candidate)
    watch(
      () => [toValue(source).type, toValue(source).id, toValue(source).positionId],
      () => {
        positionFilter.value = toValue(source).positionId || ''
        list.queryState.value = { terms: [] }
        void list.load()
      },
      { immediate: true },
    )
  return {
    ...list,
    data: computed(() => list.data.value.data),
    positionFilter,
    search,
    clearPositionFilter,
  }
}
