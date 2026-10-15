<script setup lang="ts">
import { ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Field, FormContext } from '@/modules/authentication-manager-ui/types/forms'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import { prepareModel } from '@/modules/authentication-manager-ui/utils/model'
import SchemaFields from '@/modules/authentication-manager-ui/components/forms/SchemaFields.vue'
import FormModal from '@/shared/components/FormModal.vue'
const props = defineProps({
  modelValue: { type: Object as PropType<Model | undefined>, default: undefined },
  fields: { type: Array as PropType<Field[]>, required: true },
  context: { type: Object as PropType<FormContext>, default: () => ({}) },
  state: {
    type: Object as PropType<{ busy: boolean; error: string; title: string }>,
    required: true,
  },
})
const emit = defineEmits<{ 'update:modelValue': [value: undefined]; save: [value: Model] }>()
const draft = ref<Model>({})
const parseError = ref('')
const { t } = useI18n()
watch(
  () => props.modelValue,
  (value) => {
    draft.value = value ? (JSON.parse(JSON.stringify(value)) as Model) : {}
    parseError.value = ''
  },
  { immediate: true },
)
function save() {
  try {
    const value = prepareModel(draft.value, props.fields)
    parseError.value = ''
    emit('save', value)
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : t('common.invalid')
  }
}
</script>
<template>
  <form-modal
    :open="!!modelValue"
    :title="state.title"
    :model="draft"
    :busy="state.busy"
    :error="state.error || parseError"
    form-name="system-record"
    @cancel="emit('update:modelValue', undefined)"
    @submit="save"
  >
    <schema-fields :fields="fields" :model="draft" :context="context" />
  </form-modal>
</template>
