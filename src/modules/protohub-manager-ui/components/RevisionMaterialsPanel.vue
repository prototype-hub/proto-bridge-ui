<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, ref, toRef, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useSession } from '@/app/stores/session'
import {
  Alert as AAlert,
  Button as AButton,
  Empty as AEmpty,
  Pagination as APagination,
  Tag as ATag,
} from 'ant-design-vue'
import {
  DownloadOutlined,
  FileImageOutlined,
  FileTextOutlined,
  PlusOutlined,
} from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { Project, Revision } from '../types'
import type { MaterialType } from '../types/revision-material'
import { usePermissions } from '@/shared/auth/provider'
import { protoPermissions as p } from '../routes/permissions'
import { projectAllows } from '../utils/project-access'
import { useRevisionMaterials } from '../hooks/useRevisionMaterials'
import { validSourceUrl } from '../utils/material-source'
import MaterialSourceFields from './MaterialSourceFields.vue'
import LoadState from '@/shared/components/LoadState.vue'
const props = defineProps<{ revision: Revision; project?: Project; allowed: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n(),
  permissions = usePermissions()
const readable = computed(
  () => props.allowed && projectAllows(props.project, 'read') && permissions.can(p.version.query),
)
const editable = computed(
  () => readable.value && projectAllows(props.project, 'edit') && permissions.can(p.version.save),
)
const session = useSession()
const state = useRevisionMaterials(
  toRef(props, 'revision'),
  readable,
  editable,
  computed(() => session.user?.id || ''),
)
onBeforeRouteLeave(() => state.canLeave())
function beforeUnload(event: BeforeUnloadEvent) {
  if (state.dirty.value || state.blocked.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', beforeUnload)
onScopeDispose(() => window.removeEventListener('beforeunload', beforeUnload))
const heading = ref<HTMLElement>(),
  editorHeading = ref<HTMLElement>(),
  uploadTrigger = ref<{ $el: HTMLElement }>()
const picker = ref<HTMLInputElement>()
const sourceLink = computed(() =>
  validSourceUrl(state.selected.value?.sourceUrl) ? state.selected.value?.sourceUrl || '' : '',
)
function size(bytes: number) {
  return `${(bytes / (bytes >= 1048576 ? 1048576 : 1024)).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${bytes >= 1048576 ? 'MiB' : 'KiB'}`
}
async function back() {
  if (await state.canLeave()) emit('close')
}
async function backToList() {
  if (await state.closeEditor()) await nextTick(() => uploadTrigger.value?.$el.focus())
}
async function submit() {
  await state.save()
  await nextTick()
  if (state.writeError.value)
    document.querySelector<HTMLElement>('.material-editor [role="alert"]')?.focus()
  else if (!state.mode.value) uploadTrigger.value?.$el.focus()
}
watch(state.mode, async (value) => {
  if (value) await nextTick(() => editorHeading.value?.focus())
})
onMounted(async () => {
  await nextTick()
  heading.value?.focus()
})
defineExpose({ canLeave: state.canLeave })
</script>
<template>
  <section
    class="revision-materials"
    :class="{ 'has-editor': state.mode.value }"
    :aria-label="t('proto.materials')"
  >
    <header class="materials-context">
      <h2 ref="heading" tabindex="-1">
        {{ project?.name || revision.projectId }}
        <span class="muted">/ {{ revision.versionName }}</span>
      </h2>
      <p class="materials-fixed">
        <span class="muted">{{ t('proto.workItemFixedRevision') }}</span>
        <span>{{ revision.id }}</span>
      </p>
      <p class="muted">{{ t('proto.materialsContext') }}</p>
    </header>
    <a-alert v-if="!editable && readable" type="info" :message="t('proto.materialReadOnly')" />
    <a-alert
      v-if="state.unknown.value"
      role="alert"
      type="warning"
      show-icon
      :message="t('proto.materialUnknown')"
    >
      <template #action
        ><a-button :loading="state.busy.value" @click="state.retry">{{
          t('proto.materialRetry')
        }}</a-button></template
      >
    </a-alert>
    <p v-if="state.notice.value" class="materials-notice" role="status">{{ state.notice.value }}</p>
    <div class="materials-body">
      <section class="materials-browser" :aria-label="t('proto.materialAttachments')">
        <div class="materials-prototype">
          <div>
            <strong>{{ t('proto.materialPrototype') }}</strong>
            <p class="muted">
              {{
                state.prototype.value?.sourceName ||
                state.prototype.value?.sourceTool ||
                t('proto.materialSourceMissing')
              }}
            </p>
          </div>
          <a-button
            v-if="state.prototype.value"
            :disabled="state.blocked.value"
            @click="state.openEditor('view', state.prototype.value)"
            >{{ t('proto.materialView') }}</a-button
          >
          <a-button
            v-else-if="editable"
            :disabled="state.blocked.value || state.loading.value"
            @click="state.openEditor('source')"
            >{{ t('proto.materialSourceAdd') }}</a-button
          >
        </div>
        <div class="materials-toolbar">
          <label for="material-type"
            >{{ t('proto.materialFilter') }}
            <select
              id="material-type"
              name="materialType"
              :value="state.filter.value"
              :disabled="state.blocked.value"
              @change="
                state.changeFilter(($event.target as HTMLSelectElement).value as MaterialType | '')
              "
            >
              <option value="">{{ t('proto.materialAll') }}</option>
              <option value="image">{{ t('proto.materialImage') }}</option>
              <option value="document">{{ t('proto.materialDocument') }}</option>
            </select>
          </label>
          <a-button
            v-if="editable"
            ref="uploadTrigger"
            type="primary"
            :disabled="state.blocked.value"
            @click="state.openEditor('upload')"
            ><plus-outlined aria-hidden="true" />{{ t('proto.materialUpload') }}</a-button
          >
        </div>
        <load-state
          :loading="state.loading.value"
          :error="state.error.value"
          @retry="state.refresh"
        >
          <template v-if="state.report.value">
            <p class="muted materials-result" role="status">
              {{ t('proto.materialCount', { count: state.report.value.total }) }}
            </p>
            <a-empty
              v-if="!state.report.value.data.length"
              :description="
                t(state.filter.value ? 'proto.materialNoMatches' : 'proto.materialEmpty')
              "
            >
              <p v-if="!state.filter.value" class="muted">{{ t('proto.materialEmptyHint') }}</p>
            </a-empty>
            <ul v-else class="materials-list">
              <li
                v-for="row in state.report.value.data"
                :key="row.id"
                :class="{ selected: state.selected.value?.id === row.id }"
              >
                <file-image-outlined
                  v-if="row.materialType === 'image'"
                  class="material-type-icon"
                  aria-hidden="true"
                /><file-text-outlined v-else class="material-type-icon" aria-hidden="true" />
                <div class="material-row-info">
                  <strong>{{ row.fileName }}</strong
                  ><span class="muted"
                    >{{
                      t(
                        `proto.${row.materialType === 'prototype' ? 'materialPrototype' : row.materialType === 'image' ? 'materialImage' : 'materialDocument'}`,
                      )
                    }}
                    · {{ size(row.fileSize) }}</span
                  >
                  <span v-if="row.sourceName || row.sourceTool" class="muted">{{
                    row.sourceName || row.sourceTool
                  }}</span>
                </div>
                <div class="material-row-actions">
                  <a-button
                    :disabled="state.blocked.value"
                    :aria-label="`${t('proto.materialView')}: ${row.fileName}`"
                    @click="state.openEditor('view', row)"
                    >{{ t('proto.materialView') }}</a-button
                  >
                  <a-button
                    :disabled="state.binaryBusy.value || state.blocked.value"
                    :aria-label="`${t('proto.materialDownload')}: ${row.fileName}`"
                    @click="state.content(row)"
                    ><download-outlined aria-hidden="true" />{{
                      t('proto.materialDownload')
                    }}</a-button
                  >
                </div>
              </li>
            </ul>
            <a-pagination
              v-if="state.report.value.total > 20"
              class="materials-pagination"
              :current="state.report.value.pageIndex + 1"
              :page-size="20"
              :total="state.report.value.total"
              :show-size-changer="false"
              :responsive="true"
              :disabled="state.blocked.value || state.loading.value"
              @change="state.page"
            />
          </template>
        </load-state>
      </section>
      <aside
        v-if="state.mode.value"
        class="material-editor"
        :aria-label="t('proto.materialDetails')"
      >
        <div class="material-editor-heading">
          <h3 ref="editorHeading" tabindex="-1">
            {{
              t(
                state.mode.value === 'upload'
                  ? 'proto.materialUploadTitle'
                  : state.mode.value === 'source'
                    ? 'proto.materialSourceEdit'
                    : 'proto.materialDetails',
              )
            }}
          </h3>
          <a-button :disabled="state.blocked.value" @click="backToList">{{
            t('proto.materialBackToList')
          }}</a-button>
        </div>
        <a-alert
          v-if="state.writeError.value"
          tabindex="-1"
          role="alert"
          type="error"
          :message="state.writeError.value"
        />
        <a-button v-if="state.conflict.value" @click="state.refresh">{{
          t('proto.materialRefresh')
        }}</a-button>
        <template v-if="state.mode.value === 'view' && state.selected.value">
          <div class="material-detail-name">
            <strong>{{ state.selected.value.fileName }}</strong
            ><a-tag>{{ size(state.selected.value.fileSize) }}</a-tag>
          </div>
          <dl class="material-source-details">
            <template v-for="key in ['sourceTool', 'sourceName', 'sourceNotes'] as const" :key="key"
              ><template v-if="state.selected.value[key]"
                ><dt>
                  {{
                    t(
                      `proto.${key === 'sourceTool' ? 'materialTool' : key === 'sourceName' ? 'materialName' : 'materialNotes'}`,
                    )
                  }}
                </dt>
                <dd>{{ state.selected.value[key] }}</dd></template
              ></template
            >
            <template v-if="sourceLink"
              ><dt>{{ t('proto.materialUrl') }}</dt>
              <dd>
                <a :href="sourceLink" target="_blank" rel="noopener noreferrer">{{ sourceLink }}</a>
              </dd></template
            >
          </dl>
          <p v-if="!Object.values(state.form).some(Boolean)" class="muted">
            {{ t('proto.materialSourceMissing') }}
          </p>
          <details class="materials-help">
            <summary>{{ t('proto.materialSource') }}</summary>
            <p class="muted">{{ t('proto.materialSourceDeclared') }}</p>
          </details>
          <div class="material-detail-actions">
            <a-button
              v-if="state.selected.value.materialType === 'image'"
              :loading="state.binaryBusy.value"
              @click="state.content(state.selected.value, true)"
              >{{ t('proto.materialPreview') }}</a-button
            >
            <a-button
              :disabled="state.binaryBusy.value"
              @click="state.content(state.selected.value)"
              >{{ t('proto.materialDownload') }}</a-button
            >
            <a-button v-if="editable" @click="state.openEditor('source', state.selected.value)">{{
              t('proto.materialSourceEdit')
            }}</a-button>
            <a-button v-if="editable" danger @click="state.remove(state.selected.value)">{{
              t('proto.materialDelete')
            }}</a-button>
          </div>
          <img
            v-if="state.previewUrl.value"
            class="material-image-preview"
            :src="state.previewUrl.value"
            :alt="state.selected.value.fileName"
          />
        </template>
        <form v-else class="material-form" @submit.prevent="submit">
          <template v-if="state.mode.value === 'upload'">
            <input
              ref="picker"
              class="material-file-input"
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,.txt,.md,.docx,.xlsx,.pptx"
              :disabled="state.blocked.value"
              :aria-label="t('proto.materialChoose')"
              @change="state.choose(($event.target as HTMLInputElement).files?.[0])"
            />
            <p class="muted">{{ t('proto.materialUploadHint') }}</p>
            <p v-if="state.file.value" class="material-file-selected" role="status">
              <strong>{{ state.file.value.name }}</strong> · {{ size(state.file.value.size) }}
            </p>
          </template>
          <p v-if="state.mode.value === 'source' && !state.selected.value" class="muted">
            {{ t('proto.materialSourceMissingHint') }}
          </p>
          <material-source-fields
            :model="state.form"
            prefix="material-source"
            :disabled="state.blocked.value || state.conflict.value"
            @change="
              (key, value) => {
                state.form[key] = value
              }
            "
          />
          <details class="materials-help">
            <summary>{{ t('proto.materialSource') }}</summary>
            <p class="muted">{{ t('proto.materialSourceDeclared') }}</p>
          </details>
          <div class="material-form-actions">
            <a-button :disabled="state.blocked.value" @click="backToList">{{
              t('common.cancel')
            }}</a-button
            ><a-button
              type="primary"
              html-type="submit"
              :loading="state.busy.value"
              :disabled="state.blocked.value || state.conflict.value"
              >{{
                t(
                  state.mode.value === 'upload'
                    ? 'proto.materialUpload'
                    : 'proto.materialSourceSave',
                )
              }}</a-button
            >
          </div>
        </form>
      </aside>
    </div>
    <a-alert
      v-if="state.writeError.value && !state.mode.value"
      role="alert"
      type="error"
      :message="state.writeError.value"
    />
    <footer class="materials-footer">
      <span v-if="state.busy.value || state.binaryBusy.value" class="muted" role="status">{{
        t('proto.materialBusy')
      }}</span
      ><a-button :disabled="state.blocked.value" @click="back">{{
        t('proto.materialBack')
      }}</a-button>
    </footer>
  </section>
</template>
<style scoped>
.revision-materials {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}
.materials-context h2 {
  margin: 0 0 var(--space-2);
  font-size: 18px;
  overflow-wrap: anywhere;
}
.materials-context p {
  margin: var(--space-1) 0;
}
.materials-fixed {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.materials-body {
  display: grid;
  min-width: 0;
}
.has-editor .materials-body {
  grid-template-columns: minmax(0, 1fr) minmax(0, 360px);
  gap: var(--space-6);
}
.materials-browser,
.material-editor {
  min-width: 0;
}
.materials-prototype {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border-block: 1px solid var(--color-border);
  padding-block: var(--space-3);
}
.materials-prototype p {
  margin: var(--space-1) 0 0;
  overflow-wrap: anywhere;
}
.materials-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
.materials-toolbar label {
  display: grid;
  gap: var(--space-1);
  font-size: 12px;
}
.materials-toolbar select {
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  min-height: 32px;
  padding: var(--space-1) var(--space-2);
}
.materials-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.materials-list li {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: var(--space-2);
  align-items: start;
  border-bottom: 1px solid var(--color-border);
  padding-block: var(--space-4);
}
.materials-list li.selected {
  background: var(--color-background);
}
.material-type-icon {
  font-size: 22px;
  color: var(--color-muted);
  padding-top: var(--space-1);
}
.material-row-info {
  display: grid;
  gap: var(--space-1);
  overflow-wrap: anywhere;
}
.material-row-info .muted {
  font-size: 12px;
}
.material-row-actions {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.materials-result {
  margin-block: var(--space-3) 0;
  font-size: 12px;
}
.materials-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-4);
}
.material-editor {
  border-inline-start: 1px solid var(--color-border);
  padding-inline-start: var(--space-6);
}
.material-editor-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.material-editor-heading h3 {
  flex: 1;
  margin: 0;
  font-size: 16px;
}
.material-detail-name {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  overflow-wrap: anywhere;
}
.material-source-details {
  display: grid;
  gap: var(--space-2);
}
.material-source-details dt {
  color: var(--color-muted);
  font-size: 12px;
}
.material-source-details dd {
  margin: 0 0 var(--space-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.material-detail-actions,
.material-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
.material-form {
  display: grid;
  gap: var(--space-3);
}
.material-form p {
  margin: 0;
}
.material-form-actions {
  justify-content: flex-end;
}
.material-file-input {
  width: 100%;
  min-width: 0;
  font: inherit;
}
.material-file-selected {
  overflow-wrap: anywhere;
}
.materials-help summary {
  cursor: pointer;
}
.materials-help p {
  margin-top: var(--space-2);
  line-height: 1.5;
}
.material-image-preview {
  display: block;
  max-width: 100%;
  max-height: 400px;
  object-fit: contain;
  margin-top: var(--space-4);
}
.materials-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}
.materials-notice {
  margin: 0;
}
@media (max-width: 700px) {
  .has-editor .materials-body {
    grid-template-columns: 1fr;
  }
  .has-editor .materials-browser {
    display: none;
  }
  .material-editor {
    border: 0;
    padding: 0;
  }
  .materials-prototype {
    flex-wrap: wrap;
  }
  .materials-toolbar :deep(.ant-btn),
  .material-row-actions :deep(.ant-btn),
  .material-form-actions :deep(.ant-btn),
  .material-detail-actions :deep(.ant-btn) {
    min-height: 40px;
    height: auto;
    white-space: normal;
  }
}
</style>
