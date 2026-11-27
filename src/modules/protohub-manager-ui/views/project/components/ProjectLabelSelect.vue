<script setup lang="ts">
import { computed, useId } from 'vue'
import {
  Select as ASelect,
  AutoComplete as AAutoComplete,
  Input as AInput,
  Button as AButton,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useProjectLabelOptions } from '../hooks/useProjectLabelOptions'
const props = withDefaults(
  defineProps<{
    kind: 'group' | 'tag'
    value?: string | string[]
    create?: boolean
    disabled?: boolean
    label: string
  }>(),
  { value: undefined, create: false, disabled: false },
)
const emit = defineEmits<{ change: [value: string | string[] | undefined] }>()
const { t } = useI18n()
const fieldId = useId()
const state = useProjectLabelOptions(props.kind)
const options = computed(() => [
  ...(!props.create && props.kind === 'group' ? [{ value: '', label: t('proto.ungrouped') }] : []),
  ...state.values.value.map((value) => ({ value, label: value })),
])
function search(value: string) {
  void state.load(value)
}
function opened(value: boolean) {
  if (value) void state.load('')
}
</script>
<template>
  <div class="project-label-select">
    <label class="sr-only" :for="fieldId">{{ label }}</label>
    <a-auto-complete
      v-if="create && kind === 'group'"
      :id="fieldId"
      :value="value as string"
      :options="options"
      :disabled="disabled"
      :aria-label="label"
      @search="search"
      @focus="opened(true)"
      @update:value="emit('change', String($event ?? ''))"
    >
      <a-input :maxlength="64" :aria-label="label" autocomplete="off" />
    </a-auto-complete>
    <a-select
      v-else
      :id="fieldId"
      :value="value"
      :mode="create ? 'tags' : undefined"
      :options="options"
      :disabled="disabled"
      :loading="state.loading.value"
      :aria-label="label"
      :placeholder="label"
      show-search
      allow-clear
      :filter-option="false"
      @search="search"
      @dropdown-visible-change="opened"
      @change="emit('change', $event as string | string[] | undefined)"
    />
    <a-button v-if="state.error.value" type="link" size="small" @click="state.load()">{{
      t('proto.labelOptionsRetry')
    }}</a-button>
    <a-button
      v-else-if="state.values.value.length < state.total.value"
      type="link"
      size="small"
      :loading="state.loading.value"
      :disabled="disabled"
      @click="state.more()"
      >{{ t('proto.moreLabelOptions') }}</a-button
    >
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
.project-label-select {
  min-width: 0;
}
.project-label-select :deep(.ant-select) {
  width: 100%;
}
.project-label-select :deep(.ant-select-selection-overflow) {
  flex-wrap: wrap;
}
.project-label-select :deep(.ant-select-selection-item) {
  max-width: 100%;
}
</style>
