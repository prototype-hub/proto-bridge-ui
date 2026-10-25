<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { Button as AButton, Select as ASelect } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import QueryRow from '@/shared/components/QueryRow.vue'
import type { QueryDraftTerm, QueryField } from '@/shared/api/types'
import { useI18n } from 'vue-i18n'
import type { PrototypeListSort } from '@/modules/protohub-manager-ui/types'

const props = defineProps({
  keyword: { type: String, required: true },
  sort: { type: String as PropType<PrototypeListSort>, required: true },
  loading: { type: Boolean, default: false },
})
const emit = defineEmits<{
  'update:keyword': [value: string]
  search: []
  reset: []
  sort: [value: PrototypeListSort]
  refresh: []
}>()
const { t } = useI18n()
const fields: QueryField[] = [
  { key: 'name', label: 'common.name', termType: 'like', operators: ['like'] },
]
const term = computed(() => ({ column: 'name', termType: 'like', value: props.keyword }))
/** The prototype API supports a single literal name; do not advertise unsupported group or operator semantics. */
function change(value: QueryDraftTerm) {
  emit(
    'update:keyword',
    value.column === 'name' && typeof value.value === 'string' ? value.value.slice(0, 128) : '',
  )
}
const options = computed(() => [
  { value: 'createTime:desc', label: t('proto.newestFirst') },
  { value: 'createTime:asc', label: t('proto.oldestFirst') },
  { value: 'name:asc', label: t('proto.nameAscending') },
  { value: 'name:desc', label: t('proto.nameDescending') },
])
</script>
<template>
  <div class="prototype-list-toolbar panel">
    <section class="prototype-list-filters" :aria-label="t('proto.searchByName')">
      <div class="prototype-query">
        <query-row
          :term="term"
          :fields="fields"
          :path="[0, 0]"
          compact
          @change="change"
          @search="emit('search')"
        />
      </div>
      <div class="prototype-search-actions">
        <a-button type="primary" @click="emit('search')"
          ><template #icon><search-outlined /></template>{{ t('common.search') }}</a-button
        >
        <a-button @click="emit('reset')">{{ t('system.reset') }}</a-button>
      </div>
    </section>
    <div class="prototype-list-order">
      <a-select
        :value="sort"
        :aria-label="t('proto.listSort')"
        :options="options"
        @change="emit('sort', $event as PrototypeListSort)"
      />
      <a-button :loading="loading" @click="emit('refresh')"
        ><template #icon><reload-outlined /></template>{{ t('common.refresh') }}</a-button
      >
    </div>
  </div>
</template>
<style scoped>
.prototype-list-toolbar {
  display: grid;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
  min-width: 0;
}
.prototype-list-filters {
  display: grid;
  grid-template-columns: minmax(0, 580px) auto;
  align-items: start;
  gap: var(--space-4);
  min-width: 0;
}
.prototype-query {
  min-width: 0;
  container-type: inline-size;
  container-name: query-group;
}
.prototype-search-actions,
.prototype-list-order {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.prototype-search-actions {
  justify-content: flex-end;
}
.prototype-list-order :deep(.ant-select) {
  min-width: 180px;
}
.prototype-list-order :deep(.ant-btn) {
  margin-inline-start: auto;
}
@media (width <= 1000px) {
  .prototype-list-filters {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
