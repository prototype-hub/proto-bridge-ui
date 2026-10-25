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
import { FOLDER_LIMITS } from '@/modules/protohub-manager-ui/utils/folder-archive'
import type { UploadContext } from '@/modules/protohub-manager-ui/types'
const props = defineProps({
  open: { type: Boolean, default: false },
  context: { type: Object as PropType<UploadContext>, required: true },
})
const emit = defineEmits<{ close: []; uploaded: [] }>()
const { t } = useI18n()
const {
  task,
  form,
  file,
  folder,
  folderPathIssues,
  folderPathIssueCount,
  phase,
  packingProgress,
  progress,
  outcomeUnknown,
  choose,
  chooseFolder,
  submit,
  cancelPacking,
  cancel,
} = useUpload(
  toRef(props, 'open'),
  toRef(props, 'context'),
  () => emit('uploaded'),
  () => emit('close'),
)
const folderSupported =
  'webkitdirectory' in document.createElement('input') && typeof Worker !== 'undefined'

/** One directory change supplies the complete FileList; beforeUpload fires once per file. */
function selectFolder() {
  if (task.busy.value || !folderSupported) return
  const picker = document.createElement('input')
  picker.type = 'file'
  picker.webkitdirectory = true
  picker.multiple = true
  picker.onchange = () => void chooseFolder(Array.from(picker.files || []))
  picker.click()
}

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
    ><a-alert
      type="info"
      :message="
        t(context.version ? 'proto.updateTarget' : 'proto.createTarget', {
          name: context.version?.versionName || '',
        })
      "
    />
    <a-alert v-if="outcomeUnknown" type="warning" :message="t('proto.uploadUnknown')" />
    <a-alert v-if="task.error.value" type="error" :message="task.error.value">
      <template v-if="folderPathIssues.length" #description>
        <ul class="folder-path-issues">
          <li v-for="(issue, index) in folderPathIssues" :key="index">
            <code class="folder-path">{{ issue.path }}</code>
            <span>{{ t(`proto.folderPathReasons.${issue.reason}`) }}</span>
            <span v-if="issue.conflictingPath" class="folder-path">{{
              t('proto.folderPathConflictWith', { path: issue.conflictingPath })
            }}</span>
          </li>
        </ul>
        <p v-if="folderPathIssueCount > folderPathIssues.length">
          {{ t('proto.folderPathIssuesTruncated', { count: folderPathIssues.length }) }}
        </p>
      </template> </a-alert
    ><a-form layout="vertical" :model="form" @finish="submit"
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
      >
      <a-form-item :label="t('proto.folder')">
        <a-button :disabled="task.busy.value || !folderSupported" @click="selectFolder">{{
          t('proto.selectFolder')
        }}</a-button>
        <p class="muted">
          {{
            t('proto.folderHint', {
              files: FOLDER_LIMITS.maxFiles,
              total: FOLDER_LIMITS.maxTotalBytes / 1048576,
              single: FOLDER_LIMITS.maxFileBytes / 1048576,
            })
          }}
        </p>
        <p v-if="!folderSupported" role="status">{{ t('proto.folderErrors.unsupported') }}</p>
        <p v-if="folder" role="status">
          {{
            t('proto.folderReady', {
              name: folder.rootName,
              files: folder.fileCount,
              size: (folder.totalBytes / 1048576).toFixed(2),
            })
          }}
        </p>
        <template v-if="phase === 'packing'">
          <a-progress :percent="packingProgress.percent" status="active" />
          <p role="status">
            {{
              t(packingProgress.phase === 'reading' ? 'proto.folderReading' : 'proto.folderPacking')
            }}
          </p>
          <a-button @click="cancelPacking">{{ t('proto.cancelPacking') }}</a-button>
        </template>
      </a-form-item>
      <a-progress v-if="phase === 'uploading'" :percent="progress" status="active" />
      <p v-if="phase === 'uploading'">
        {{ t(progress === 100 ? 'proto.processing' : 'proto.uploading') }}
      </p>
      <p v-if="phase === 'uploading'" class="muted">{{ t('proto.uploadCancelHint') }}</p>
      <div class="upload-actions">
        <a-button @click="cancel">{{ t('common.cancel') }}</a-button
        ><a-button
          type="primary"
          html-type="submit"
          :loading="task.busy.value"
          :disabled="!file || task.busy.value"
          >{{ t('common.save') }}</a-button
        >
      </div></a-form
    ></a-modal
  >
</template>
<style scoped>
.folder-path-issues {
  max-height: 16rem;
  overflow: auto;
  padding-inline-start: var(--space-4);
}
.folder-path-issues li + li {
  margin-top: var(--space-2);
}
.folder-path-issues span {
  display: block;
}
.folder-path {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.upload-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
</style>
