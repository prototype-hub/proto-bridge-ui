<script setup lang="ts">
import { computed, useId } from 'vue'
import {
  Input as AInput,
  InputNumber as AInputNumber,
  Select as ASelect,
  TreeSelect as ATreeSelect,
  DatePicker as ADatePicker,
  RangePicker as ARangePicker,
  TimePicker as ATimePicker,
  TimeRangePicker as ATimeRangePicker,
  Alert as AAlert,
  Button as AButton,
} from 'ant-design-vue'
import dayjs, { type Dayjs } from 'dayjs'
import { useI18n } from 'vue-i18n'
import type { QueryField } from '@/shared/api/types'
import { useQueryOptions } from '@/shared/composables/useQueryOptions'
const props = withDefaults(
  defineProps<{
    field?: QueryField
    modelValue: unknown
    operator?: string
    ariaLabel?: string
    disabled?: boolean
  }>(),
  { field: undefined, operator: undefined, ariaLabel: undefined, disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: unknown]; search: [] }>()
const { t } = useI18n()
const controlId = useId()
const disabled = computed(
  () => props.disabled || ['isnull', 'notnull', 'empty', 'nempty'].includes(props.operator || ''),
)
const range = computed(() => ['btw', 'nbtw'].includes(props.operator || ''))
const multiple = computed(
  () => ['in', 'nin'].includes(props.operator || '') || props.field?.multiple,
)
const options = useQueryOptions(
  () => props.field,
  () => props.modelValue,
)
const selected = computed(() => {
  const values = (Array.isArray(props.modelValue) ? props.modelValue : [props.modelValue]).filter(
    (value): value is string | number =>
      typeof value === 'number'
        ? Number.isFinite(value)
        : typeof value === 'string' && value !== '',
  )
  return multiple.value ? values : values[0]
})
function dateValue(value: unknown): Dayjs | undefined {
  if ((typeof value !== 'string' || !value) && typeof value !== 'number') return undefined
  const date = dayjs(value)
  return date.isValid() ? date : undefined
}
function timeValue(value: unknown): Dayjs | undefined {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value)
    ? dayjs(`1970-01-01 ${value}`)
    : undefined
}
function formatTime(value: unknown): string | undefined {
  if (dayjs.isDayjs(value)) return value.isValid() ? value.format('HH:mm:ss') : undefined
  if (typeof value === 'string') return timeValue(value)?.format('HH:mm:ss')
  return undefined
}
function updateTime(value: unknown) {
  emit('update:modelValue', formatTime(value) ?? '')
}
function updateTimeRange(value: unknown) {
  const values = Array.isArray(value) && value.length === 2 ? value.map(formatTime) : []
  const [start, end] = values
  emit('update:modelValue', start && end ? [start, end] : [])
}
const date = computed(() => dateValue(props.modelValue))
const time = computed(() => timeValue(props.modelValue))
function rangeValue(converter: (value: unknown) => Dayjs | undefined): [Dayjs, Dayjs] | undefined {
  if (!Array.isArray(props.modelValue) || props.modelValue.length !== 2) return undefined
  const start = converter(props.modelValue[0]),
    end = converter(props.modelValue[1])
  return start && end ? [start, end] : undefined
}
const dates = computed(() => rangeValue(dateValue))
const times = computed(() => rangeValue(timeValue))
const text = computed(() => {
  const value = props.modelValue
  if (Array.isArray(value))
    return value.every((item) => typeof item === 'string' || typeof item === 'number')
      ? value.join(',')
      : JSON.stringify(value)
  return value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
})
function updateNumberRange(index: number, value: string | number | null) {
  const values = Array.isArray(props.modelValue) ? [...props.modelValue] : [undefined, undefined]
  values[index] = value === null || value === '' ? undefined : Number(value)
  emit('update:modelValue', values)
}
</script>
<template>
  <div class="query-value-container">
    <template v-if="ariaLabel">
      <template v-if="field?.type === 'number' && range">
        <label class="query-value-label" :for="`${controlId}-start`"
          >{{ ariaLabel }} {{ t('system.rangeStart') }}</label
        >
        <label class="query-value-label" :for="`${controlId}-end`"
          >{{ ariaLabel }} {{ t('system.rangeEnd') }}</label
        >
      </template>
      <label v-else class="query-value-label" :for="controlId">{{ ariaLabel }}</label>
    </template>
    <a-select
      v-if="field?.type === 'select'"
      :id="controlId"
      :value="selected"
      :mode="multiple ? 'multiple' : undefined"
      :options="options.options.value"
      :loading="options.loading.value"
      :disabled="disabled"
      :placeholder="t('system.keyword')"
      :filter-option="field.loadOptions ? false : undefined"
      show-search
      option-filter-prop="label"
      allow-clear
      class="query-value"
      @search="options.search.value = $event"
      @update:value="emit('update:modelValue', $event ?? '')"
    />
    <a-tree-select
      v-else-if="field?.type === 'treeSelect'"
      :id="controlId"
      :value="selected"
      :multiple="multiple"
      :tree-data="options.options.value"
      :field-names="{ label: 'label', value: 'value', children: 'children' }"
      :loading="options.loading.value"
      :disabled="disabled"
      :placeholder="t('system.keyword')"
      :filter-tree-node="field.loadOptions ? false : undefined"
      tree-node-filter-prop="label"
      show-search
      allow-clear
      class="query-value"
      @search="options.search.value = $event"
      @update:value="emit('update:modelValue', $event ?? '')"
    />
    <a-range-picker
      v-else-if="field?.type === 'date' && (range || !operator)"
      :id="controlId"
      :value="dates"
      show-time
      :disabled="disabled"
      class="query-date"
      @update:value="
        (value) => emit('update:modelValue', value?.map((item) => item.valueOf()) || [])
      "
    />
    <a-date-picker
      v-else-if="field?.type === 'date'"
      :id="controlId"
      :value="date"
      show-time
      :disabled="disabled"
      class="query-value"
      @update:value="(value) => emit('update:modelValue', value?.valueOf() ?? '')"
    />
    <a-time-range-picker
      v-else-if="field?.type === 'time' && range"
      :id="controlId"
      :value="times"
      :disabled="disabled"
      format="HH:mm:ss"
      class="query-date"
      @update:value="updateTimeRange"
    />
    <a-time-picker
      v-else-if="field?.type === 'time'"
      :id="controlId"
      :value="time"
      :disabled="disabled"
      format="HH:mm:ss"
      class="query-value"
      @update:value="updateTime"
    />
    <div v-else-if="field?.type === 'number' && range" class="query-number-range">
      <a-input-number
        :id="`${controlId}-start`"
        :value="Array.isArray(modelValue) ? modelValue[0] : undefined"
        :disabled="disabled"
        :placeholder="t('system.rangeStart')"
        @update:value="updateNumberRange(0, $event)"
      />
      <span>~</span>
      <a-input-number
        :id="`${controlId}-end`"
        :value="Array.isArray(modelValue) ? modelValue[1] : undefined"
        :disabled="disabled"
        :placeholder="t('system.rangeEnd')"
        @update:value="updateNumberRange(1, $event)"
      />
    </div>
    <a-input-number
      v-else-if="field?.type === 'number' && !multiple"
      :id="controlId"
      :value="typeof modelValue === 'number' ? modelValue : undefined"
      :disabled="disabled"
      class="query-value"
      @update:value="emit('update:modelValue', $event ?? '')"
      @press-enter="emit('search')"
    />
    <a-input
      v-else
      :id="controlId"
      :value="text"
      :placeholder="t('system.keyword')"
      :disabled="disabled"
      class="query-value"
      @update:value="emit('update:modelValue', $event)"
      @press-enter="emit('search')"
    />
    <a-alert v-if="options.error.value" :message="options.error.value" type="error" show-icon>
      <template #action>
        <a-button
          size="small"
          type="link"
          :loading="options.loading.value"
          @click="options.reload"
          >{{ t('common.retry') }}</a-button
        >
      </template>
    </a-alert>
  </div>
</template>
<style scoped>
.query-value-container {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--space-1);
}
.query-value-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.query-value {
  width: 240px;
  max-width: 100%;
}
.query-date {
  max-width: 100%;
}
.query-number-range {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
</style>
