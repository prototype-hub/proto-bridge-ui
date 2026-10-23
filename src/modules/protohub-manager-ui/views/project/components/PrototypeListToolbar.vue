<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { Button as AButton, InputSearch as AInputSearch, Select as ASelect } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { PrototypeListSort } from '@/modules/protohub-manager-ui/types'

defineProps({
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
const options = computed(() => [
  { value: 'createTime:desc', label: t('proto.newestFirst') },
  { value: 'createTime:asc', label: t('proto.oldestFirst') },
  { value: 'name:asc', label: t('proto.nameAscending') },
  { value: 'name:desc', label: t('proto.nameDescending') },
])
</script>
<template>
  <div class="prototype-list-toolbar">
    <a-input-search
      :value="keyword"
      :aria-label="t('proto.searchByName')"
      :placeholder="t('proto.searchByName')"
      :maxlength="128"
      @update:value="emit('update:keyword', $event)"
      @search="emit('search')"
    />
    <a-select
      :value="sort"
      :aria-label="t('proto.listSort')"
      :options="options"
      @change="emit('sort', $event as PrototypeListSort)"
    />
    <a-button @click="emit('reset')">{{ t('system.reset') }}</a-button>
    <a-button :loading="loading" @click="emit('refresh')">{{ t('common.refresh') }}</a-button>
  </div>
</template>
<style scoped>
.prototype-list-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  min-width: 0;
}
.prototype-list-toolbar :deep(.ant-input-search) {
  flex: 1 1 220px;
  max-width: 360px;
}
.prototype-list-toolbar :deep(.ant-select) {
  min-width: 180px;
}
</style>
