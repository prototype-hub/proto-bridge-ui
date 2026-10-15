import { computed } from 'vue'
import type { Query } from '@/shared/api/types'
import { useQueryList } from '@/shared/composables/useQueryList'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import { resultOf, recordsOf, isRecord } from '@/modules/authentication-manager-ui/utils/model'
export function useOrganizationRecords(fetcher: (query: Query) => Promise<unknown>) {
  const list = useQueryList<SystemRecord>(
    async (query) => {
      const response = await fetcher(query)
      const value = resultOf(response),
        rows = recordsOf(response)
      return {
        data: rows,
        total: isRecord(value) && typeof value.total === 'number' ? value.total : rows.length,
        pageIndex: query.pageIndex || 0,
        pageSize: query.pageSize || 20,
      }
    },
    {
      immediate: false,
      beforeQuery: (query) => ({ ...query, sorts: [{ name: 'createTime', order: 'desc' }] }),
    },
  )
  return { ...list, data: computed(() => list.data.value.data) }
}
