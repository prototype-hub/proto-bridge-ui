<script setup lang="ts">
import { computed, ref, type PropType } from 'vue'
import { Button as AButton } from 'ant-design-vue'
import { DoubleRightOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import QueryHistory from './QueryHistory.vue'
import QueryConditions from './QueryConditions.vue'
import {
  cloneQueryTerms,
  createQueryGroups,
  defaultOperator,
  normalizeQueryTerms,
} from '@/shared/utils/query-model'
import type { Query, QueryDraft, QueryDraftTerm, QueryField } from '@/shared/api/types'
const props = defineProps({
  fields: { type: Array as PropType<QueryField[]>, required: true },
  target: { type: String, default: '' },
})
const emit = defineEmits<{ search: [query: Query] }>()
const { t } = useI18n()
const expanded = ref(false)
const terms = ref<QueryDraftTerm[]>(createQueryGroups(props.fields))
// History and the visible editor share the same draft; only a search crosses into transport terms.
const currentQuery = computed<Query>(() => ({ terms: terms.value }))
function leaves(rows: QueryDraftTerm[]): QueryDraftTerm[] {
  return rows.flatMap((term) => (term.terms ? leaves(term.terms) : [term]))
}
function filled(term: QueryDraftTerm): boolean {
  if (!term.column) return false
  const operator =
    term.termType || defaultOperator(props.fields.find((field) => field.key === term.column))
  if (['isnull', 'notnull', 'empty', 'nempty'].includes(operator)) return true
  if (term.value == null || term.value === '') return false
  if (!Array.isArray(term.value)) return true
  return ['btw', 'nbtw'].includes(operator)
    ? term.value.length === 2 && term.value.every((value) => value != null && value !== '')
    : !!term.value.length
}
const hiddenCount = computed(() => leaves(terms.value).slice(1).filter(filled).length)
function search() {
  emit('search', { terms: normalizeQueryTerms(terms.value, props.fields, 'draft') })
}
function reset() {
  terms.value = createQueryGroups(props.fields)
  expanded.value = false
  emit('search', { terms: [] })
}
function apply(query: QueryDraft) {
  terms.value = query.terms.length ? cloneQueryTerms(query.terms) : createQueryGroups(props.fields)
  expanded.value = true
  search()
}
</script>
<template>
  <section class="pro-query" :aria-label="t('system.queryFilters')">
    <div class="query-layout" :class="{ 'query-layout-collapsed': !expanded }">
      <query-conditions
        v-model:terms="terms"
        :fields="fields"
        :expanded="expanded"
        @search="search"
      />
      <div class="query-footer">
        <div class="query-footer-actions">
          <a-button @click="reset">{{ t('system.reset') }}</a-button>
          <query-history
            :query="currentQuery"
            :fields="fields"
            :target="target"
            @search="search"
            @apply="apply"
          />
        </div>
        <a-button
          class="query-toggle"
          type="link"
          :aria-expanded="expanded"
          :aria-label="t(expanded ? 'system.collapseQueryFilters' : 'system.moreQueryFilters')"
          @click="expanded = !expanded"
        >
          <span class="query-toggle-label">
            {{ t(expanded ? 'system.collapseQueryFilters' : 'system.moreQueryFilters') }}
            <span v-if="!expanded && hiddenCount" class="query-hidden-count">{{
              t('system.hiddenQueryConditions', { count: hiddenCount })
            }}</span>
          </span>
          <double-right-outlined :rotate="expanded ? -90 : 90" />
        </a-button>
      </div>
    </div>
  </section>
</template>
<style scoped>
.pro-query {
  container: query-panel / inline-size;
  min-width: 0;
  padding-bottom: var(--space-4);
}
.query-layout {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}
.query-layout-collapsed {
  grid-template-columns: minmax(0, 580px) minmax(0, 1fr);
  align-items: start;
}
.query-footer,
.query-footer-actions {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  min-width: 0;
}
.query-footer {
  flex-wrap: wrap;
}
.query-footer-actions {
  flex-wrap: wrap;
}
.query-layout-collapsed .query-footer {
  justify-content: flex-end;
}
.query-layout-collapsed .query-toggle {
  margin-left: 0;
}
.query-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  min-height: 32px;
  margin-left: auto;
  padding-right: 0;
  white-space: normal;
  height: auto;
}
.query-toggle-label {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}
.query-toggle :deep(.anticon) {
  flex: none;
}
.query-hidden-count {
  color: var(--color-primary);
  font-weight: 500;
}
@container query-panel (max-width: 1099px) {
  .query-layout-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  .query-layout-collapsed > :deep(.query-conditions) {
    max-width: 580px;
  }
  .query-layout-collapsed .query-footer {
    justify-content: normal;
  }
  .query-layout-collapsed .query-toggle {
    margin-left: auto;
  }
}
</style>
