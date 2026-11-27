<script setup lang="ts">
import { onMounted, onUnmounted, reactive, watch, type PropType } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { FormItem as AFormItem, Input as AInput, Textarea as ATextarea } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { ProjectInput } from '@/modules/protohub-manager-ui/types'
import FormModal from '@/shared/components/FormModal.vue'
import ProjectCover from './ProjectCover.vue'
import { safeProjectCover } from '@/modules/protohub-manager-ui/utils/project-organization'
const props = defineProps({
  open: { type: Boolean, default: false },
  form: { type: Object as PropType<ProjectInput>, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits<{ close: []; save: [input: ProjectInput] }>()
const { t } = useI18n()
const localForm = reactive<ProjectInput>({ name: '', description: '', cover: '' })
let baseline = ''
function canClose() {
  return (
    !props.open ||
    JSON.stringify(localForm) === baseline ||
    window.confirm(t('proto.discardOrganization'))
  )
}
function close() {
  if (!props.busy && canClose()) emit('close')
}
function submit() {
  const cover =
    localForm.cover === props.form.cover ? props.form.cover : localForm.cover?.trim() || ''
  emit('save', { ...localForm, cover })
}
function validateCover(_rule: unknown, value: string | undefined) {
  return value === props.form.cover || !value?.trim() || safeProjectCover(value.trim())
    ? Promise.resolve()
    : Promise.reject(new Error(t('proto.coverInvalid')))
}
onBeforeRouteLeave(canClose)
onBeforeRouteUpdate(canClose)
function beforeUnload(event: BeforeUnloadEvent) {
  if (props.open && JSON.stringify(localForm) !== baseline) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload))
watch(
  () => props.open,
  (open) => {
    if (open) {
      Object.assign(localForm, { name: '', description: '', cover: '' }, props.form)
      baseline = JSON.stringify(localForm)
    } else {
      Object.assign(localForm, { name: '', description: '', cover: '' })
      baseline = ''
    }
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
    @cancel="close"
    @submit="submit"
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
    ><a-form-item name="cover" :label="t('proto.coverUrl')" :rules="[{ validator: validateCover }]">
      <a-input v-model:value="localForm.cover" :maxlength="1024" autocomplete="off" />
      <project-cover
        v-if="localForm.cover"
        :value="localForm.cover"
        :name="localForm.name || t('proto.projects')"
      />
    </a-form-item>
  </form-modal>
</template>
