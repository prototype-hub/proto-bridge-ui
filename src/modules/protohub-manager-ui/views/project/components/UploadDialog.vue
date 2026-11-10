<script setup lang="ts">
import { ref, toRef, watch, type PropType } from 'vue'
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
import MaterialSourceFields from '@/modules/protohub-manager-ui/components/MaterialSourceFields.vue'
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
const importMode = ref<'zip' | 'folder'>('zip')
watch(
  () => props.open,
  (value) => {
    if (value) importMode.value = 'zip'
  },
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
    root-class-name="prototype-import-dialog"
    :destroy-on-close="true"
    :open="open"
    :title="t(context.version ? 'proto.update' : 'proto.upload')"
    :width="600"
    :mask-closable="false"
    :styles="{
      body: { maxHeight: 'calc(100dvh - 220px)', overflowY: 'auto', paddingInlineEnd: '4px' },
    }"
    @cancel="cancel"
  >
    <p class="import-context">
      {{
        t(context.version ? 'proto.updateTarget' : 'proto.createTarget', {
          name: context.version?.versionName || '',
        })
      }}
    </p>
    <a-alert
      v-if="outcomeUnknown"
      role="alert"
      type="warning"
      :message="t('proto.uploadUnknown')"
    />
    <a-alert v-if="task.error.value" role="alert" type="error" :message="task.error.value">
      <template v-if="folderPathIssues.length" #description>
        <ul class="folder-path-issues">
          <li v-for="(issue, index) in folderPathIssues" :key="index">
            <code class="folder-path">{{ issue.path }}</code
            ><span>{{ t(`proto.folderPathReasons.${issue.reason}`) }}</span>
            <span v-if="issue.conflictingPath" class="folder-path">{{
              t('proto.folderPathConflictWith', { path: issue.conflictingPath })
            }}</span>
          </li>
        </ul>
        <p v-if="folderPathIssueCount > folderPathIssues.length">
          {{ t('proto.folderPathIssuesTruncated', { count: folderPathIssues.length }) }}
        </p>
      </template>
    </a-alert>
    <a-form id="prototype-import-form" layout="vertical" :model="form" @finish="submit">
      <a-form-item
        name="versionName"
        :label="t('proto.versionName')"
        :rules="[{ required: true, whitespace: true, message: t('common.required') }]"
      >
        <a-input
          v-model:value="form.versionName"
          name="versionName"
          :maxlength="128"
          :disabled="task.busy.value || outcomeUnknown"
          autocomplete="off"
        />
      </a-form-item>
      <fieldset class="import-method" :disabled="task.busy.value || outcomeUnknown">
        <legend>{{ t('proto.importMode') }}</legend>
        <div class="import-method-options">
          <label
            ><input v-model="importMode" type="radio" name="importMode" value="zip" />{{
              t('proto.importZip')
            }}</label
          >
          <label
            ><input v-model="importMode" type="radio" name="importMode" value="folder" />{{
              t('proto.importFolder')
            }}</label
          >
        </div>
      </fieldset>
      <div v-if="importMode === 'zip'" class="import-picker">
        <a-upload-dragger
          accept=".zip,application/zip"
          :show-upload-list="false"
          :before-upload="beforeUpload"
          :disabled="task.busy.value || outcomeUnknown"
        >
          <p class="import-upload-icon"><inbox-outlined aria-hidden="true" /></p>
          <p>{{ t('proto.importSelect') }}</p>
          <p class="muted">{{ t('proto.zipHint') }}</p>
        </a-upload-dragger>
      </div>
      <div v-else class="import-folder-picker">
        <a-button
          :disabled="task.busy.value || outcomeUnknown || !folderSupported"
          @click="selectFolder"
          >{{ t('proto.selectFolder') }}</a-button
        >
        <p v-if="!folderSupported" role="status">{{ t('proto.folderErrors.unsupported') }}</p>
      </div>
      <div v-if="file" class="import-selected" role="status">
        <span class="muted">{{ t('proto.importSelected') }}</span
        ><strong>{{ folder?.rootName || file.name }}</strong>
        <span class="muted">{{
          folder
            ? t('proto.folderReady', {
                name: folder.rootName,
                files: folder.fileCount,
                size: (folder.totalBytes / 1048576).toFixed(2),
              })
            : `${(file.size / 1048576).toLocaleString(undefined, { maximumFractionDigits: 2 })} MiB`
        }}</span>
      </div>
      <template v-if="phase === 'packing'">
        <a-progress :percent="packingProgress.percent" status="active" />
        <p role="status">
          {{
            t(packingProgress.phase === 'reading' ? 'proto.folderReading' : 'proto.folderPacking')
          }}
        </p>
        <a-button @click="cancelPacking">{{ t('proto.cancelPacking') }}</a-button>
      </template>
      <details class="import-details">
        <summary>{{ t('common.description') }}</summary>
        <a-textarea
          v-model:value="form.description"
          name="description"
          :aria-label="t('common.description')"
          :rows="3"
          :maxlength="2000"
          :disabled="task.busy.value || outcomeUnknown"
        />
      </details>
      <details class="import-details">
        <summary>{{ t('proto.materialOptionalSource') }}</summary>
        <material-source-fields
          :model="form"
          prefix="import-source"
          :disabled="task.busy.value || outcomeUnknown"
          @change="
            (key, value) => {
              form[key] = value
            }
          "
        />
        <p class="muted">{{ t('proto.materialSourceDeclared') }}</p>
      </details>
      <details class="import-details import-help">
        <summary>{{ t('proto.importGuide') }}</summary>
        <p class="muted">
          {{
            t('proto.folderHint', {
              files: FOLDER_LIMITS.maxFiles,
              total: FOLDER_LIMITS.maxTotalBytes / 1048576,
              single: FOLDER_LIMITS.maxFileBytes / 1048576,
            })
          }}
        </p>
      </details>
      <template v-if="phase === 'uploading'">
        <a-progress :percent="progress" status="active" />
        <p role="status">{{ t(progress === 100 ? 'proto.processing' : 'proto.uploading') }}</p>
        <p class="muted">{{ t('proto.uploadCancelHint') }}</p>
      </template>
    </a-form>
    <template #footer>
      <div class="upload-actions">
        <a-button :disabled="outcomeUnknown" @click="cancel">{{ t('common.cancel') }}</a-button>
        <a-button
          type="primary"
          html-type="submit"
          form="prototype-import-form"
          :loading="task.busy.value"
          :disabled="!file || task.busy.value"
          >{{
            t(
              outcomeUnknown
                ? 'proto.materialRetry'
                : context.version
                  ? 'proto.importUpdate'
                  : 'proto.importSave',
            )
          }}</a-button
        >
      </div>
    </template>
  </a-modal>
</template>
<style scoped>
.import-context {
  color: var(--color-muted);
  margin-block: 0 var(--space-4);
  line-height: 1.5;
}
.import-method {
  border: 0;
  padding: 0;
  margin: 0 0 var(--space-3);
  min-width: 0;
}
.import-method legend {
  font-size: inherit;
  margin-bottom: var(--space-2);
}
.import-method-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}
.import-method-options label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 32px;
  cursor: pointer;
}
.import-upload-icon {
  color: var(--color-primary);
  font-size: 28px;
  margin-bottom: var(--space-2);
}
.import-picker :deep(.ant-upload-drag) {
  padding-block: var(--space-2);
}
.import-selected {
  display: grid;
  gap: var(--space-1);
  margin-top: var(--space-3);
  padding: var(--space-3);
  background: var(--color-background);
  overflow-wrap: anywhere;
}
.import-details {
  border-top: 1px solid var(--color-border);
  margin-top: var(--space-4);
  padding-top: var(--space-3);
}
.import-details summary {
  cursor: pointer;
  padding-block: var(--space-1);
}
.import-details[open] summary {
  margin-bottom: var(--space-3);
}
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
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}
@media (max-width: 600px) {
  .upload-actions :deep(.ant-btn) {
    min-height: 40px;
    height: auto;
    white-space: normal;
  }
}
</style>
