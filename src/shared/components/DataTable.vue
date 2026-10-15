<script setup lang="ts" generic="T extends { id: string }">
import { Table as ATable } from 'ant-design-vue'
import type { PropType } from 'vue'
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue'
defineProps({
  rows: { type: Array as PropType<T[]>, required: true },
  columns: { type: Array as PropType<TableColumnsType<T>>, required: true },
  pagination: {
    type: [Object, Boolean] as PropType<TablePaginationConfig | false>,
    default: false,
  },
  loading: { type: Boolean, default: false },
})
const emit = defineEmits<{ page: [page: number, pageSize: number] }>()
defineSlots<{
  cell(props: {
    record: T
    column: { key?: string | number; dataIndex: string }
    index: number
  }): unknown
}>()
function cellScope(scope: {
  record: unknown
  column: { key?: string | number; dataIndex?: unknown }
  index: number
}) {
  return {
    record: scope.record as T,
    column: { key: scope.column.key, dataIndex: String(scope.column.dataIndex || '') },
    index: scope.index,
  }
}
</script>
<template>
  <a-table
    row-key="id"
    :data-source="rows"
    :columns="columns"
    :loading="loading"
    :pagination="pagination"
    :scroll="{ x: 720 }"
    @change="(p) => emit('page', p.current || 1, p.pageSize || 20)"
    ><template #bodyCell="scope"><slot name="cell" v-bind="cellScope(scope)" /></template
  ></a-table>
</template>
