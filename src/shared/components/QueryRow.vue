<script setup lang="ts">
import { computed } from 'vue'
import { Button as AButton, Select as ASelect } from 'ant-design-vue'
import { MinusOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { QueryDraftTerm, QueryField } from '@/shared/api/types'
import {
  changeQueryField,
  changeQueryOperator,
  defaultOperator,
  queryOperators,
} from '@/shared/utils/query-model'
import QueryValue from './QueryValue.vue'

const props = withDefaults(
  defineProps<{
    term: QueryDraftTerm
    fields: QueryField[]
    path: number[]
    label?: string
    removable?: boolean
    compact?: boolean
  }>(),
  { label: '', removable: true, compact: false },
)
const emit = defineEmits<{ change: [term: QueryDraftTerm]; remove: []; search: [] }>()
const { t } = useI18n()
const field = computed(() => props.fields.find((item) => item.key === props.term.column))
const operator = computed(() => props.term.termType || defaultOperator(field.value))
const position = computed(() => ({ group: props.path[0]! + 1, row: props.path.at(-1)! + 1 }))
const fieldLabel = computed(() =>
  props.path.join('.') === '0.0'
    ? t('system.queryField')
    : t('system.queryFieldPosition', position.value),
)
const fieldOptions = computed(() => {
  const options = props.fields.map((item) => ({
    value: item.key,
    label: t(item.label),
    disabled: !queryOperators(item).length,
  }))
  if (props.term.column && !field.value)
    options.push({ value: props.term.column, label: props.term.column, disabled: false })
  return options
})
const operatorOptions = computed(() => {
  const operators = queryOperators(field.value)
  return operators.map((value) => ({ value, label: t(`system.operator.${value}`) }))
})
function change(term: Partial<QueryDraftTerm>) {
  emit('change', { ...props.term, ...term })
}
</script>
<template>
  <div
    class="query-row query-condition"
    :class="{ 'query-row-compact': compact }"
    :data-query-row="path.join('.')"
  >
    <template v-if="!compact">
      <span v-if="label" class="query-row-label">{{ label }}</span>
      <a-select
        v-else
        class="query-row-relation"
        :value="term.type || 'or'"
        :aria-label="t('system.queryRowRelation', position)"
        :options="[
          { value: 'and', label: t('system.and') },
          { value: 'or', label: t('system.or') },
        ]"
        @update:value="change({ type: $event as 'and' | 'or' })"
      />
    </template>
    <a-select
      class="query-field"
      :value="term.column || undefined"
      :aria-label="fieldLabel"
      :placeholder="t('system.chooseQueryField')"
      :options="fieldOptions"
      allow-clear
      @update:value="emit('change', changeQueryField(term, String($event || ''), fields))"
    />
    <a-select
      class="query-operator"
      :value="term.column ? operator || undefined : undefined"
      :aria-label="t('system.queryOperatorPosition', position)"
      :placeholder="t('system.chooseQueryOperator')"
      :disabled="!term.column || !operatorOptions.length"
      :options="operatorOptions"
      @update:value="emit('change', changeQueryOperator(term, String($event), fields))"
    />
    <query-value
      :model-value="term.value"
      :field="field"
      :operator="operator"
      :disabled="!term.column || !operatorOptions.length"
      :aria-label="t('system.queryValuePosition', position)"
      @update:model-value="change({ value: $event })"
      @search="emit('search')"
    />
    <a-button
      v-if="!compact"
      type="text"
      danger
      class="query-remove-condition"
      :disabled="!removable"
      :aria-label="t('system.removeQueryCondition', position)"
      @click="emit('remove')"
      ><template #icon><minus-outlined /></template
    ></a-button>
  </div>
</template>
<style scoped>
.query-row {
  display: grid;
  grid-template-columns: 90px 130px 110px minmax(0, 1fr) 24px;
  align-items: start;
  gap: var(--space-4);
  min-width: 0;
}
.query-row-compact {
  grid-template-columns: 130px 110px minmax(0, 308px);
}
.query-row-label {
  display: flex;
  align-items: center;
  min-height: 32px;
  color: var(--color-text);
}
.query-row > :deep(*) {
  min-width: 0;
}
.query-row > :deep(.ant-select),
.query-row > :deep(.query-value-container) {
  width: 100%;
}
.query-row :deep(.query-value),
.query-row :deep(.query-date) {
  width: 100%;
  min-width: 0;
}
.query-row :deep(.query-number-range) {
  min-width: 0;
}
.query-row :deep(.query-number-range > .ant-input-number) {
  flex: 1;
  min-width: 0;
  width: 100%;
}
.query-row :deep(.ant-picker-input),
.query-row :deep(.ant-picker-input > input) {
  min-width: 0;
}
.query-row :deep(.ant-alert) {
  min-width: 0;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.query-row :deep(.ant-alert-content) {
  min-width: 0;
  overflow-wrap: anywhere;
}
.query-row :deep(.ant-alert-action) {
  margin-left: auto;
}
.query-remove-condition {
  justify-self: end;
  width: 24px;
  padding: 0;
}
@container query-group (max-width: 519px) {
  .query-row:not(.query-row-compact) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 24px;
  }
  .query-row:not(.query-row-compact) > .query-row-label,
  .query-row:not(.query-row-compact) > .query-row-relation {
    grid-column: 1 / 3;
  }
  .query-row:not(.query-row-compact) > .query-field {
    grid-column: 1;
    grid-row: 2;
  }
  .query-row:not(.query-row-compact) > .query-operator {
    grid-column: 2;
    grid-row: 2;
  }
  .query-row:not(.query-row-compact) > :deep(.query-value-container) {
    grid-column: 1 / 3;
  }
  .query-remove-condition {
    grid-column: 3;
    grid-row: 1 / 4;
    align-self: start;
  }
}
@container query-group (max-width: 579px) {
  .query-row-compact {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .query-row-compact > :deep(.query-value-container) {
    grid-column: 1 / -1;
  }
}
</style>
