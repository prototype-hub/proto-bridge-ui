<script setup lang="ts">
import { Button as AButton, Select as ASelect } from 'ant-design-vue'
import { MinusOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { QueryDraftTerm, QueryField } from '@/shared/api/types'
import { createQueryTerm } from '@/shared/utils/query-model'
import QueryRow from './QueryRow.vue'

const props = withDefaults(
  defineProps<{
    terms: QueryDraftTerm[]
    fields: QueryField[]
    path: number[]
    label: string
    top?: boolean
    removable?: boolean
  }>(),
  { top: false, removable: false },
)
const emit = defineEmits<{ 'update:terms': [terms: QueryDraftTerm[]]; remove: []; search: [] }>()
const { t } = useI18n()
function update(index: number, term: QueryDraftTerm) {
  emit(
    'update:terms',
    props.terms.map((row, position) => (position === index ? term : row)),
  )
}
function remove(index: number) {
  emit(
    'update:terms',
    props.terms.filter((_, position) => position !== index),
  )
}
function add() {
  emit('update:terms', [...props.terms, { ...createQueryTerm([]), type: 'or' }])
}
</script>
<template>
  <section class="query-group" :data-query-group="top ? path[0] : undefined" :aria-label="label">
    <div class="query-group-rows">
      <template v-for="(term, index) in terms" :key="index">
        <div v-if="term.terms" class="query-nested-group">
          <span v-if="!index" class="query-row-label">{{ label }}</span>
          <a-select
            v-else
            class="query-row-relation"
            :value="term.type || 'or'"
            :aria-label="t('system.queryGroupRelation')"
            :options="[
              { value: 'and', label: t('system.and') },
              { value: 'or', label: t('system.or') },
            ]"
            @update:value="update(index, { ...term, type: $event as 'and' | 'or' })"
          />
          <query-group
            :terms="term.terms"
            :fields="fields"
            :path="[...path, index]"
            :label="t('system.queryNestedGroup')"
            @update:terms="update(index, { ...term, terms: $event })"
            @search="emit('search')"
          />
          <a-button
            type="text"
            danger
            :disabled="terms.length < 2"
            :aria-label="t('system.removeQueryCondition', { group: path[0]! + 1, row: index + 1 })"
            @click="remove(index)"
            ><template #icon><minus-outlined /></template
          ></a-button>
        </div>
        <query-row
          v-else
          :term="term"
          :fields="fields"
          :path="[...path, index]"
          :label="index ? '' : label"
          :removable="terms.length > 1"
          @change="update(index, $event)"
          @remove="remove(index)"
          @search="emit('search')"
        />
      </template>
    </div>
    <div class="query-group-actions">
      <a-button type="link" class="query-add-condition" @click="add"
        ><template #icon><plus-outlined /></template>{{ t('system.addCondition') }}</a-button
      >
      <a-button
        v-if="top"
        type="text"
        danger
        class="query-remove-group"
        :disabled="!removable"
        :aria-label="t('system.removeQueryGroup', { index: path[0]! + 1 })"
        @click="emit('remove')"
        ><template #icon><minus-outlined /></template>{{ t('system.removeGroup') }}</a-button
      >
    </div>
  </section>
</template>
<style scoped>
.query-group {
  container: query-group / inline-size;
  min-width: 0;
}
.query-group-rows {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}
.query-group-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-top: var(--space-2);
}
.query-add-condition {
  width: fit-content;
  padding-left: 0;
}
.query-nested-group {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr) 24px;
  align-items: start;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
}
.query-nested-group > .query-row-label {
  display: flex;
  align-items: center;
  min-height: 32px;
}
@container query-group (max-width: 519px) {
  .query-nested-group {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
