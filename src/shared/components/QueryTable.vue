<script setup lang="ts" generic="T extends { id: string }">
import { Comment, Fragment, isVNode, type PropType, type VNode } from 'vue'
import { Alert as AAlert, Button as AButton } from 'ant-design-vue'
import type { TableColumnsType, TablePaginationConfig, TableProps } from 'ant-design-vue'
import { ReloadOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { Query, QueryField } from '@/shared/api/types'
import ProQuery from './ProQuery.vue'
import LoadState from './LoadState.vue'
import DataTable from './DataTable.vue'

type TableOptions = Omit<TableProps<T>, 'dataSource' | 'columns' | 'pagination' | 'loading'>
defineProps({
  fields: { type: Array as PropType<QueryField[]>, default: () => [] },
  target: { type: String, default: '' },
  rows: { type: Array as PropType<T[]>, required: true },
  columns: { type: Array as PropType<TableColumnsType<T>>, required: true },
  pagination: {
    type: [Object, Boolean] as PropType<TablePaginationConfig | false>,
    default: false,
  },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  actionError: { type: String, default: '' },
  panel: { type: Boolean, default: true },
  tableProps: { type: Object as PropType<TableOptions>, default: undefined },
})
const emit = defineEmits<{
  search: [query: Query]
  page: [current: number, size: number]
  refresh: []
  retry: []
}>()
const slots = defineSlots<{
  toolbar?: () => unknown
  filters?: () => unknown
  cell?: (props: {
    record: T
    column: { key?: string | number; dataIndex: string }
    index: number
  }) => unknown
}>()
const { t } = useI18n()
function containsContent(nodes: VNode[] | undefined): boolean {
  return !!nodes?.some((node) => {
    if (node.type === Comment) return false
    if (node.type === Fragment && Array.isArray(node.children))
      return containsContent(node.children.filter(isVNode))
    return typeof node.children === 'string' ? !!node.children.trim() : true
  })
}
// Conditional slots can exist but render only comments; those must not add empty layout rows.
function hasContent(name: 'toolbar' | 'filters') {
  return containsContent(slots[name]?.() as VNode[] | undefined)
}
</script>
<template>
  <div class="query-table" :class="{ panel }">
    <pro-query
      v-if="fields.length"
      :fields="fields"
      :target="target"
      @search="emit('search', $event)"
    />
    <div v-if="hasContent('filters')" class="query-table-filters"><slot name="filters" /></div>
    <div class="query-table-toolbar">
      <div v-if="hasContent('toolbar')" class="query-table-actions"><slot name="toolbar" /></div>
      <a-button
        class="query-table-refresh"
        :aria-label="t('common.refresh')"
        :loading="loading"
        @click="emit('refresh')"
      >
        <template #icon><reload-outlined /></template>{{ t('common.refresh') }}
      </a-button>
    </div>
    <a-alert v-if="actionError" type="error" :message="actionError" show-icon />
    <load-state :loading="loading" :error="error" @retry="emit('retry')">
      <data-table
        v-bind="tableProps"
        :rows="rows"
        :columns="columns"
        :pagination="pagination"
        @page="(current, size) => emit('page', current, size)"
      >
        <template v-if="slots.cell" #cell="scope"><slot name="cell" v-bind="scope" /></template>
      </data-table>
    </load-state>
  </div>
</template>
<style scoped>
.query-table {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
}
.query-table-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.query-table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.query-table-refresh {
  margin-left: auto;
}
</style>
