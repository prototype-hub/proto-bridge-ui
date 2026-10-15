<script setup lang="ts">
import { toRef, type PropType } from 'vue'
import {
  Modal as AModal,
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  Textarea as ATextarea,
  UploadDragger as AUploadDragger,
  Button as AButton,
  Progress as AProgress,
  Alert as AAlert,
  Upload,
} from 'ant-design-vue'
import { InboxOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { useUpload } from '@/modules/protohub-manager-ui/views/project/hooks/useUpload'
import type { UploadContext } from '@/modules/protohub-manager-ui/types'
const props = defineProps({
  open: { type: Boolean, default: false },
  context: { type: Object as PropType<UploadContext>, required: true },
})
const emit = defineEmits<{ close: []; uploaded: [] }>()
const { t } = useI18n()
const { task, form, file, progress, choose, submit, cancel } = useUpload(
  toRef(props, 'open'),
  toRef(props, 'context'),
  () => emit('uploaded'),
  () => emit('close'),
)
const beforeUpload = (selected: File) => {
  choose(selected)
  return Upload.LIST_IGNORE
}
</script>
<template>
  <a-modal
    :destroy-on-close="true"
    :open="open"
    :title="t(context.version ? 'proto.update' : 'proto.upload')"
    :footer="null"
    :mask-closable="false"
    @cancel="cancel"
    ><a-alert v-if="context.version" type="info" :message="t('proto.updateHint')" /><a-alert
      v-if="task.error.value"
      type="error"
      :message="task.error.value"
    /><a-form layout="vertical" :model="form" @finish="submit"
      ><a-form-item
        name="versionName"
        :label="t('proto.versionName')"
        :rules="[{ required: true, whitespace: true, message: t('common.required') }]"
        ><a-input
          v-model:value="form.versionName"
          :maxlength="128"
          :disabled="task.busy.value" /></a-form-item
      ><a-form-item :label="t('common.description')"
        ><a-textarea
          v-model:value="form.description"
          :rows="3"
          :maxlength="2000"
          :disabled="task.busy.value" /></a-form-item
      ><a-form-item :label="t('proto.zip')"
        ><a-upload-dragger
          accept=".zip,application/zip"
          :show-upload-list="false"
          :before-upload="beforeUpload"
          :disabled="task.busy.value"
          ><p class="ant-upload-drag-icon"><inbox-outlined /></p>
          <p>{{ file?.name || t('proto.zip') }}</p>
          <p class="muted">{{ t('proto.zipHint') }}</p></a-upload-dragger
        ></a-form-item
      ><a-progress v-if="task.busy.value" :percent="progress" status="active" />
      <p v-if="task.busy.value">
        {{ t(progress === 100 ? 'proto.processing' : 'proto.uploading') }}
      </p>
      <div class="upload-actions">
        <a-button @click="cancel">{{ t('common.cancel') }}</a-button
        ><a-button type="primary" html-type="submit" :loading="task.busy.value" :disabled="!file">{{
          t('common.save')
        }}</a-button>
      </div></a-form
    ></a-modal
  >
</template>
<style scoped>
.upload-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
</style>
