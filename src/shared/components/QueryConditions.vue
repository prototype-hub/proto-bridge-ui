<script setup lang="ts">
import { computed } from 'vue'
import { Button as AButton, Select as ASelect } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { QueryDraftTerm, QueryField } from '@/shared/api/types'
import { cloneQueryTerms, createQueryGroups, createQueryTerm } from '@/shared/utils/query-model'
import QueryGroup from './QueryGroup.vue'
import QueryRow from './QueryRow.vue'

const props = withDefaults(
  defineProps<{ terms: QueryDraftTerm[]; fields: QueryField[]; expanded?: boolean }>(),
  { expanded: true },
)
const emit = defineEmits<{ 'update:terms': [terms: QueryDraftTerm[]]; search: [] }>()
const { t } = useI18n()
const flat = computed(() => props.terms.every((term) => !term.terms))
const first = computed(() => firstLeaf(props.terms))
function groupLabel(index: number) {
  return t(
    index === 0
      ? 'system.firstQueryGroup'
      : index === 1
        ? 'system.secondQueryGroup'
        : 'system.queryGroup',
    { index: index + 1 },
  )
}
function firstLeaf(
  terms: QueryDraftTerm[],
  path: number[] = [],
): { term: QueryDraftTerm; path: number[] } | undefined {
  for (const [index, term] of terms.entries()) {
    const current = [...path, index]
    if (!term.terms) return { term, path: current }
    const leaf = firstLeaf(term.terms, current)
    if (leaf) return leaf
  }
}
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
function addGroup() {
  const terms =
    flat.value && props.terms.length ? [{ terms: cloneQueryTerms(props.terms) }] : props.terms
  emit('update:terms', [...terms, { ...createQueryGroups([], 1)[0]!, type: 'and' }])
}
function updateFirst(term: QueryDraftTerm) {
  const path = first.value?.path
  if (!path) {
    emit('update:terms', [{ terms: [term] }])
    return
  }
  // Replace only the visible leaf so folding never truncates hidden or nested conditions.
  function replace(rows: QueryDraftTerm[], depth: number): QueryDraftTerm[] {
    return rows.map((row, index) =>
      index !== path![depth]
        ? row
        : depth === path!.length - 1
          ? term
          : { ...row, terms: replace(row.terms || [], depth + 1) },
    )
  }
  emit('update:terms', replace(props.terms, 0))
}
</script>
<template>
  <div class="query-conditions">
    <section
      v-if="!expanded"
      class="query-group query-group-compact"
      data-query-group="0"
      :aria-label="groupLabel(0)"
    >
      <query-row
        :term="first?.term || createQueryTerm(fields)"
        :fields="fields"
        :path="first && first.path.length > 1 ? first.path : [0, 0]"
        :removable="false"
        compact
        @change="updateFirst"
        @search="emit('search')"
      />
    </section>
    <template v-else>
      <div class="query-groups" :class="{ 'query-groups-pair': !flat && terms.length === 2 }">
        <query-group
          v-if="flat"
          :terms="terms"
          :fields="fields"
          :path="[0]"
          :label="groupLabel(0)"
          top
          @update:terms="emit('update:terms', $event)"
          @search="emit('search')"
        />
        <template v-for="(term, index) in flat ? [] : terms" :key="index">
          <a-select
            v-if="index"
            class="query-group-relation"
            :value="term.type || 'and'"
            :aria-label="t('system.queryGroupRelation')"
            :options="[
              { value: 'and', label: t('system.and') },
              { value: 'or', label: t('system.or') },
            ]"
            @update:value="update(index, { ...term, type: $event as 'and' | 'or' })"
          />
          <query-group
            :terms="term.terms || [term]"
            :fields="fields"
            :path="[index]"
            :label="groupLabel(index)"
            top
            :removable="terms.length > 1"
            @update:terms="
              update(
                index,
                term.terms
                  ? { ...term, terms: $event }
                  : $event.length === 1
                    ? $event[0]!
                    : { terms: $event, type: term.type },
              )
            "
            @remove="remove(index)"
            @search="emit('search')"
          />
        </template>
      </div>
      <a-button class="query-add-group" type="link" @click="addGroup"
        ><template #icon><plus-outlined /></template>{{ t('system.addQueryGroup') }}</a-button
      >
    </template>
  </div>
</template>
<style scoped>
.query-conditions {
  min-width: 0;
}
.query-group-compact {
  container: query-group / inline-size;
  min-width: 0;
}
.query-groups {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}
.query-groups-pair {
  grid-template-columns: minmax(0, 1fr) 80px minmax(0, 1fr);
  align-items: start;
}
.query-group-relation {
  width: 80px;
  justify-self: center;
  align-self: start;
}
.query-groups-pair > .query-group-relation {
  margin-top: 48px;
}
.query-add-group {
  width: fit-content;
  margin-top: var(--space-2);
  padding-left: 0;
}
@container query-panel (max-width: 1239px) {
  .query-groups-pair {
    grid-template-columns: minmax(0, 1fr);
  }
  .query-groups-pair > .query-group-relation {
    margin-top: 0;
  }
}
</style>
