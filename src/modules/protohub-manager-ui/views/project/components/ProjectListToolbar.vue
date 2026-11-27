<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { Button as AButton, Input as AInput, Select as ASelect } from 'ant-design-vue'
import { StarOutlined, SearchOutlined, ReloadOutlined, FilterOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { ProjectListQuery, PrototypeListSort } from '@/modules/protohub-manager-ui/types'
import ProjectLabelSelect from './ProjectLabelSelect.vue'
type Filters = Pick<ProjectListQuery, 'archived' | 'groupName' | 'tag' | 'favoriteOnly'>
defineProps<{
  keyword: string
  sort: PrototypeListSort
  filters: Filters
  loading: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{
  'update:keyword': [value: string]
  search: []
  reset: []
  refresh: []
  sort: [value: PrototypeListSort]
  filter: [patch: Partial<Filters>]
}>()
const { t } = useI18n()
const expanded = ref(false)
const stateId = useId(),
  sortId = useId()
const sorts = computed(() => [
  { value: 'createTime:desc', label: t('proto.newestFirst') },
  { value: 'createTime:asc', label: t('proto.oldestFirst') },
  { value: 'name:asc', label: t('proto.nameAscending') },
  { value: 'name:desc', label: t('proto.nameDescending') },
])
const states = computed(() => [
  { value: 'active', label: t('proto.organizationActive') },
  { value: 'archived', label: t('proto.organizationArchived') },
  { value: 'all', label: t('proto.organizationAll') },
])
function archiveFilter(value: string) {
  emit('filter', { archived: value === 'all' ? null : value === 'archived' })
}
function reset() {
  expanded.value = false
  emit('reset')
}
</script>
<template>
  <div class="project-list-toolbar panel">
    <div class="project-name-filter">
      <a-input
        :disabled="disabled"
        :value="keyword"
        :aria-label="t('proto.projectNameSearch')"
        :placeholder="t('proto.projectNameSearch')"
        :maxlength="128"
        autocomplete="off"
        allow-clear
        @update:value="emit('update:keyword', $event)"
        @press-enter="emit('search')"
      />
      <a-button
        :disabled="disabled"
        type="primary"
        :aria-label="t('common.search')"
        @click="emit('search')"
        ><template #icon><search-outlined /></template
      ></a-button>
      <a-button :disabled="disabled" @click="reset">{{ t('system.reset') }}</a-button>
    </div>
    <div class="project-quick-filters">
      <a-button
        :disabled="disabled"
        :aria-pressed="!!filters.favoriteOnly"
        :type="filters.favoriteOnly ? 'primary' : 'default'"
        @click="emit('filter', { favoriteOnly: !filters.favoriteOnly })"
        ><template #icon><star-outlined /></template>{{ t('proto.favorites') }}</a-button
      >
      <label class="sr-only" :for="stateId">{{ t('proto.projectState') }}</label>
      <a-select
        :id="stateId"
        :disabled="disabled"
        :value="filters.archived === null ? 'all' : filters.archived ? 'archived' : 'active'"
        :options="states"
        :aria-label="t('proto.projectState')"
        @change="archiveFilter($event as string)"
      />
      <a-button
        :disabled="disabled"
        :aria-expanded="expanded"
        aria-controls="project-label-filters"
        @click="expanded = !expanded"
        ><template #icon><filter-outlined /></template>{{ t('proto.projectFilters')
        }}<span v-if="filters.groupName != null || filters.tag">
          · {{ (filters.groupName != null ? 1 : 0) + (filters.tag ? 1 : 0) }}</span
        ></a-button
      >
    </div>
    <div class="project-list-order">
      <label class="sr-only" :for="sortId">{{ t('proto.listSort') }}</label>
      <a-select
        :id="sortId"
        :disabled="disabled"
        :value="sort"
        :aria-label="t('proto.listSort')"
        :options="sorts"
        @change="emit('sort', $event as PrototypeListSort)"
      />
      <a-button
        :disabled="disabled"
        :loading="loading"
        :aria-label="t('common.refresh')"
        @click="emit('refresh')"
        ><template #icon><reload-outlined /></template
      ></a-button>
    </div>
    <div v-if="expanded" id="project-label-filters" class="project-label-filters">
      <div>
        <label>{{ t('proto.projectGroup') }}</label
        ><project-label-select
          :disabled="disabled"
          kind="group"
          :value="filters.groupName ?? undefined"
          :label="t('proto.allGroups')"
          @change="emit('filter', { groupName: typeof $event === 'string' ? $event : undefined })"
        />
      </div>
      <div>
        <label>{{ t('proto.projectTags') }}</label
        ><project-label-select
          :disabled="disabled"
          kind="tag"
          :value="filters.tag ?? undefined"
          :label="t('proto.allTags')"
          @change="emit('filter', { tag: typeof $event === 'string' ? $event : undefined })"
        />
      </div>
    </div>
  </div>
</template>
<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.project-list-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  padding: var(--space-3);
}
.project-name-filter {
  display: flex;
  flex: 1 1 280px;
  min-width: 0;
  gap: var(--space-2);
}
.project-name-filter :deep(.ant-input-affix-wrapper) {
  min-width: 0;
}
.project-quick-filters,
.project-list-order {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.project-quick-filters :deep(.ant-select) {
  width: 136px;
}
.project-list-order :deep(.ant-select) {
  width: 160px;
}
.project-label-filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  flex-basis: 100%;
  gap: var(--space-3);
}
.project-label-filters label {
  display: block;
  margin-bottom: var(--space-1);
  font-size: var(--text-small);
  color: var(--color-muted);
}
@media (width <= 575px) {
  .project-list-toolbar {
    gap: var(--space-2);
  }
  .project-name-filter {
    flex-basis: 100%;
  }
  .project-quick-filters {
    flex: 1 1 100%;
    justify-content: space-between;
    gap: var(--space-1);
  }
  .project-quick-filters :deep(.ant-btn) {
    padding-inline: var(--space-2);
  }
  .project-quick-filters :deep(.ant-select) {
    width: 124px;
  }
  .project-list-order {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
