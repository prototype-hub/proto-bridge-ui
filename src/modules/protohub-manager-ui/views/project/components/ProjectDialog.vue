<script setup lang="ts">
import { reactive, watch, type PropType } from 'vue'
import { FormItem as AFormItem, Input as AInput, Textarea as ATextarea } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { ProjectInput } from '@/modules/protohub-manager-ui/types'
import FormModal from '@/shared/components/FormModal.vue'
const props = defineProps({
  open: { type: Boolean, default: false },
  form: { type: Object as PropType<ProjectInput>, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits<{ close: []; save: [input: ProjectInput] }>()
const { t } = useI18n()
const localForm = reactive<ProjectInput>({ name: '', description: '' })
watch(
  () => props.open,
  (open) => {
    if (open) Object.assign(localForm, props.form)
  },
  { immediate: true },
)
</script>
<template>
  <form-modal
    :open="open"
    :title="t('proto.projects')"
    :width="520"
    :model="localForm"
    :busy="busy"
    :error="error"
    form-name="project-editor"
    @cancel="emit('close')"
    @submit="emit('save', { ...localForm })"
    ><a-form-item
      name="name"
      :label="t('common.name')"
      :rules="[{ required: true, whitespace: true, message: t('common.required') }]"
      ><a-input v-model:value="localForm.name" :maxlength="128" /></a-form-item
    ><a-form-item name="description" :label="t('common.description')"
      ><a-textarea
        v-model:value="localForm.description"
        :rows="4"
        :maxlength="2000"
        show-count /></a-form-item
  ></form-modal>
</template>
