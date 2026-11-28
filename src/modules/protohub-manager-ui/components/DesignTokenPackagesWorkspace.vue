<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import {
  Alert as AAlert,
  Button as AButton,
  Checkbox as ACheckbox,
  Pagination as APagination,
  Skeleton as ASkeleton,
  Modal,
} from 'ant-design-vue'
import {
  ArrowLeftOutlined,
  CloseOutlined,
  DownloadOutlined,
  ImportOutlined,
} from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { useDesignTokenPackages } from '../hooks/useDesignTokenPackages'
import { validSourceUrl } from '../utils/material-source'
import { tokenJson } from '../utils/design-token-package'
import type { DesignTokenPackage, DesignTokenScope } from '../types/design-token-package'
import MaterialSourceFields from './MaterialSourceFields.vue'
import DesignTokenDocumentExplorer from './DesignTokenDocumentExplorer.vue'
import DesignTokenIssues from './DesignTokenIssues.vue'

const props = defineProps<{ scope: DesignTokenScope }>()
const emit = defineEmits<{ close: [] }>()
const state = useDesignTokenPackages(computed(() => props.scope))
const { t, locale } = useI18n()
const root = ref<HTMLElement>(),
  heading = ref<HTMLElement>(),
  fileInput = ref<HTMLInputElement>(),
  feedback = ref<HTMLElement>()
const mobilePane = ref<'list' | 'detail'>('list')
const [modal, ModalContextHolder] = Modal.useModal()
const disabled = computed(() => !state.canEdit.value || state.locked.value || state.conflict.value)
const sourceErrors = computed(() =>
  validSourceUrl(state.source.sourceUrl) ? {} : { sourceUrl: t('proto.materialUrlInvalid') },
)
const sourceLabels = {
  sourceTool: 'materialTool',
  sourceName: 'materialName',
  sourceUrl: 'materialUrl',
  sourceNotes: 'materialNotes',
} as const
const saveDisabled = computed(
  () =>
    disabled.value ||
    !!sourceErrors.value.sourceUrl ||
    (state.mode.value === 'import' &&
      (!state.preview.value ||
        state.validating.value ||
        (!state.preview.value.valid && !state.allowInvalid.value))),
)
const displayedDocument = computed(() =>
  state.mode.value === 'import' ? state.preview.value : state.document.value,
)
watch(state.notice, async (value) => {
  if (value) {
    await nextTick()
    feedback.value?.focus()
  }
})
watch(state.selected, (value) => {
  if (value) mobilePane.value = 'detail'
  else if (state.mode.value === 'browse') mobilePane.value = 'list'
})
function date(value: number) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(
    value,
  )
}
function confirm(title: string, content: string, okText: string, danger = false) {
  return new Promise<boolean>((resolve) =>
    modal.confirm({
      zIndex: 1100,
      title,
      content,
      okText,
      okButtonProps: { danger },
      cancelText: t('proto.tokenKeep'),
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  )
}
async function canLeave() {
  if (state.busy.value) {
    state.error.value = t('proto.tokenBusy')
    return false
  }
  return (
    (!state.dirty.value && !state.unknown.value) ||
    (await confirm(
      t('proto.tokenLeaveTitle'),
      t(state.unknown.value ? 'proto.tokenUnknownLeave' : 'proto.tokenLeaveHint'),
      t('proto.tokenLeave'),
    ))
  )
}
async function focusHeading() {
  await nextTick()
  heading.value?.focus()
}
async function close() {
  if (await canLeave()) emit('close')
}
async function show(row: DesignTokenPackage) {
  if (!(await canLeave())) return
  if (await state.show(row)) {
    mobilePane.value = 'detail'
    await focusHeading()
  }
}
async function startImport() {
  if (!(await canLeave())) return
  state.startImport()
  mobilePane.value = 'detail'
  await nextTick()
  root.value?.querySelector<HTMLElement>('.token-file-button')?.focus()
}
async function cancel() {
  if (!(await canLeave())) return
  state.clearEditor()
  mobilePane.value = state.selected.value ? 'detail' : 'list'
  await focusHeading()
}
async function editSource() {
  state.editSource()
  await nextTick()
  root.value?.querySelector<HTMLElement>('#token-source-tool')?.focus()
}
async function backList() {
  if (!(await canLeave())) return
  state.clearEditor()
  mobilePane.value = 'list'
  await focusHeading()
}
async function remove() {
  const row = state.selected.value
  if (!row || !(await canLeave())) return
  if (
    await confirm(
      t('proto.tokenRemoveTitle', { name: row.fileName }),
      t('proto.tokenRemoveHint'),
      t('proto.tokenRemove'),
      true,
    )
  )
    state.remove()
}
function fileChanged(event: Event) {
  const input = event.target as HTMLInputElement
  void state.pickFile(input.files?.[0])
  input.value = ''
}
function keydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (event.key === 'Escape') {
    event.preventDefault()
    void close()
    return
  }
  if (event.key !== 'Tab' || !root.value) return
  const elements = [
    ...root.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
    ),
  ].filter((item) => item.offsetParent !== null)
  const first = elements[0],
    last = elements.at(-1)
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === heading.value)
  ) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
function unload(event: BeforeUnloadEvent) {
  if (state.dirty.value || state.locked.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onBeforeRouteLeave(canLeave)
onBeforeRouteUpdate(canLeave)
let background: HTMLElement[] = []
onMounted(() => {
  background = [...document.body.children].filter(
    (element) =>
      element instanceof HTMLElement && !element.contains(root.value || null) && !element.inert,
  ) as HTMLElement[]
  background.forEach((element) => {
    element.inert = true
  })
  window.addEventListener('beforeunload', unload)
  void focusHeading()
})
onBeforeUnmount(() => {
  background.forEach((element) => {
    element.inert = false
  })
  window.removeEventListener('beforeunload', unload)
})
defineExpose({ canLeave })
</script>
<template>
  <teleport to="body">
    <div class="token-overlay">
      <section
        ref="root"
        class="token-workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-workspace-heading"
        :data-pane="mobilePane"
        @keydown="keydown"
      >
        <header class="token-header">
          <div class="token-heading">
            <h1 id="token-workspace-heading" ref="heading" tabindex="-1">
              {{ t('proto.tokenPackages') }}
            </h1>
            <p>{{ scope.project.name }} · {{ scope.revision.versionName }}</p>
          </div>
          <div class="token-actions">
            <span v-if="!state.canEdit.value && !state.denied.value" class="token-muted">{{
              t('proto.tokenReadOnly')
            }}</span
            ><a-button
              v-if="state.canEdit.value && state.mode.value === 'browse'"
              type="primary"
              :disabled="state.locked.value"
              @click="startImport"
              ><import-outlined aria-hidden="true" />{{ t('proto.tokenImport') }}</a-button
            ><a-button type="text" :aria-label="t('proto.tokenClose')" @click="close"
              ><close-outlined aria-hidden="true"
            /></a-button>
          </div>
        </header>
        <div v-if="state.error.value || state.notice.value" class="token-feedback">
          <a-alert v-if="state.error.value" type="error" show-icon :message="state.error.value"
            ><template #action
              ><div class="token-actions">
                <a-button
                  v-if="state.unknown.value"
                  size="small"
                  :loading="state.busy.value"
                  @click="state.retry"
                  >{{ t('proto.tokenRetry') }}</a-button
                ><a-button
                  v-if="state.conflict.value && state.mode.value !== 'import'"
                  size="small"
                  :disabled="state.locked.value"
                  @click="state.readCurrent"
                  >{{ t('proto.tokenReadCurrent') }}</a-button
                ><a-button :disabled="state.busy.value" size="small" @click="state.load()">{{
                  t('proto.tokenRefresh')
                }}</a-button>
              </div></template
            ></a-alert
          >
          <p
            v-if="state.notice.value"
            ref="feedback"
            class="token-notice"
            role="status"
            tabindex="-1"
          >
            {{ state.notice.value }}
          </p>
        </div>
        <div v-if="!state.denied.value" class="token-workspace-body">
          <aside class="token-package-pane" :aria-label="t('proto.tokenPackages')">
            <div class="token-list-heading">
              <strong
                >{{ t('proto.tokenPackages')
                }}<span v-if="state.rows.value"> ({{ state.rows.value.total }})</span></strong
              ><a-button
                type="text"
                size="small"
                :disabled="state.busy.value"
                @click="state.load()"
                >{{ t('proto.tokenRefresh') }}</a-button
              >
            </div>
            <a-skeleton
              v-if="state.loading.value && !state.rows.value"
              active
              :paragraph="{ rows: 4 }"
            />
            <ul v-else-if="state.rows.value?.data.length" class="token-package-list">
              <li v-for="row in state.rows.value.data" :key="row.id">
                <button
                  type="button"
                  :aria-pressed="
                    state.selected.value?.id === row.id && state.mode.value === 'browse'
                  "
                  :disabled="state.locked.value"
                  @click="show(row)"
                >
                  <strong>{{ row.sourceName || row.fileName }}</strong
                  ><span v-if="row.sourceName" class="token-muted">{{ row.fileName }}</span
                  ><span>{{
                    t('proto.tokenSummary', { tokens: row.tokenCount, groups: row.groupCount })
                  }}</span
                  ><span class="token-muted"
                    >{{ t(row.valid ? 'proto.tokenValid' : 'proto.tokenInvalid') }} ·
                    {{ date(row.createdAt) }}</span
                  >
                </button>
              </li>
            </ul>
            <div v-else class="token-empty">
              <strong>{{ t('proto.tokenEmpty') }}</strong>
              <p>{{ t('proto.tokenEmptyHint') }}</p>
            </div>
            <a-pagination
              v-if="state.rows.value && state.rows.value.total > 20"
              :current="state.pageIndex.value + 1"
              :total="state.rows.value.total"
              :page-size="20"
              :show-size-changer="false"
              simple
              :disabled="state.locked.value"
              @change="state.load($event - 1)"
            />
          </aside>
          <main class="token-main-pane">
            <div class="token-main-content">
              <a-button class="token-mobile-back" :disabled="state.busy.value" @click="backList"
                ><arrow-left-outlined aria-hidden="true" />{{ t('proto.tokenBackList') }}</a-button
              >
              <template v-if="state.mode.value !== 'browse'">
                <h2>
                  {{
                    t(
                      state.mode.value === 'import'
                        ? 'proto.tokenImportTitle'
                        : 'proto.tokenSourceEdit',
                    )
                  }}
                </h2>
                <section v-if="state.mode.value === 'import'" class="token-file-stage">
                  <p class="token-muted">{{ t('proto.tokenFileHint') }}</p>
                  <input
                    ref="fileInput"
                    type="file"
                    hidden
                    accept=".json,application/json"
                    :disabled="disabled"
                    :aria-label="t('proto.tokenChooseFile')"
                    @change="fileChanged"
                  />
                  <div class="token-actions">
                    <a-button
                      class="token-file-button"
                      :disabled="disabled"
                      :loading="state.validating.value"
                      @click="fileInput?.click()"
                      >{{ t('proto.tokenChooseFile') }}</a-button
                    ><span v-if="state.file.value"
                      >{{ state.file.value.name }} ·
                      {{ state.file.value.size.toLocaleString(locale) }} B</span
                    ><a-button
                      v-if="state.file.value && !state.preview.value && !state.validating.value"
                      :disabled="disabled"
                      @click="state.pickFile(state.file.value)"
                      >{{ t('proto.tokenRetryValidation') }}</a-button
                    >
                  </div>
                </section>
                <material-source-fields
                  :model="state.source"
                  prefix="token-source"
                  :disabled="disabled"
                  :errors="sourceErrors"
                  @change="state.updateSource"
                />
                <section v-if="state.serverRecord.value" class="token-server-source">
                  <h3>{{ t('proto.tokenServerSource') }}</h3>
                  <dl>
                    <template v-for="(label, key) in sourceLabels" :key="key"
                      ><dt>{{ t(`proto.${label}`) }}</dt>
                      <dd>{{ state.serverRecord.value[key] || '—' }}</dd></template
                    >
                  </dl>
                  <div class="token-actions">
                    <a-button @click="state.resolveConflict(true)">{{
                      t('proto.tokenKeepDraft')
                    }}</a-button
                    ><a-button @click="state.resolveConflict(false)">{{
                      t('proto.tokenUseServer')
                    }}</a-button>
                  </div>
                </section>
              </template>
              <template v-else-if="state.selected.value">
                <div class="token-package-title">
                  <div>
                    <h2>{{ state.selected.value.sourceName || state.selected.value.fileName }}</h2>
                    <p class="token-muted">
                      {{
                        t('proto.tokenSummary', {
                          tokens: state.selected.value.tokenCount,
                          groups: state.selected.value.groupCount,
                        })
                      }}
                      · DTCG {{ state.selected.value.standardVersion }}
                    </p>
                  </div>
                  <div class="token-actions">
                    <a-button :disabled="state.locked.value" @click="state.downloadOriginal"
                      ><download-outlined aria-hidden="true" />{{
                        t('proto.tokenOriginal')
                      }}</a-button
                    ><a-button
                      v-if="state.canEdit.value"
                      :disabled="state.locked.value"
                      @click="editSource"
                      >{{ t('proto.tokenSourceEdit') }}</a-button
                    ><a-button
                      v-if="state.canEdit.value"
                      danger
                      :disabled="state.locked.value || state.conflict.value"
                      @click="remove"
                      >{{ t('proto.tokenRemove') }}</a-button
                    >
                  </div>
                </div>
                <details class="token-package-metadata">
                  <summary>{{ t('proto.tokenMetadata') }}</summary>
                  <dl>
                    <dt>{{ t('proto.tokenFileName') }}</dt>
                    <dd>{{ state.selected.value.fileName }}</dd>
                    <dt>{{ t('proto.tokenFileSize') }}</dt>
                    <dd>{{ state.selected.value.fileSize.toLocaleString(locale) }} B</dd>
                    <dt>SHA-256</dt>
                    <dd>
                      <code>{{ state.selected.value.sha256 }}</code>
                    </dd>
                    <dt>{{ t('proto.tokenStandard') }}</dt>
                    <dd>{{ state.selected.value.standardVersion }}</dd>
                    <dt>{{ t('proto.tokenValidator') }}</dt>
                    <dd>{{ state.selected.value.validatorVersion }}</dd>
                    <dt>{{ t('proto.tokenCreatedAt') }}</dt>
                    <dd>{{ date(state.selected.value.createdAt) }}</dd>
                    <template v-for="(label, key) in sourceLabels" :key="key"
                      ><template v-if="state.selected.value[key]"
                        ><dt>{{ t(`proto.${label}`) }}</dt>
                        <dd>
                          <a
                            v-if="key === 'sourceUrl' && validSourceUrl(state.selected.value[key])"
                            :href="state.selected.value[key] || undefined"
                            target="_blank"
                            rel="noopener noreferrer"
                            >{{ state.selected.value[key] }}</a
                          ><span v-else>{{ state.selected.value[key] }}</span>
                        </dd></template
                      ></template
                    >
                  </dl>
                </details>
                <details class="token-source-report">
                  <summary>
                    {{ t('proto.tokenSourceValidation') }} ·
                    {{ t(state.selected.value.valid ? 'proto.tokenValid' : 'proto.tokenInvalid') }}
                  </summary>
                  <design-token-issues
                    :report="state.selected.value.report"
                    :label="t('proto.tokenSourceValidation')"
                  />
                </details>
                <section v-if="state.serverRecord.value" class="token-server-source">
                  <h3>{{ t('proto.tokenServerSource') }}</h3>
                  <pre tabindex="0">{{
                    tokenJson(
                      Object.fromEntries(
                        Object.keys(sourceLabels).map((key) => [
                          key,
                          state.serverRecord.value?.[key as keyof typeof sourceLabels],
                        ]),
                      ),
                    )
                  }}</pre>
                  <a-button @click="state.resolveConflict(false)">{{
                    t('proto.tokenUseServer')
                  }}</a-button>
                </section>
              </template>
              <div v-else class="token-empty token-choose-package">
                {{ t('proto.tokenChoosePackage') }}
              </div>
              <a-skeleton
                v-if="state.documentLoading.value && !displayedDocument"
                active
                :paragraph="{ rows: 6 }"
              />
              <design-token-document-explorer
                v-else-if="displayedDocument && state.mode.value !== 'source'"
                :document="displayedDocument"
                :preview="state.mode.value === 'import'"
                :loading="state.documentLoading.value"
                :disabled="state.locked.value"
                @inputs="state.loadDocument"
              />
              <a-button
                v-else-if="
                  state.selected.value &&
                  state.mode.value === 'browse' &&
                  !state.documentLoading.value
                "
                :disabled="state.locked.value"
                @click="state.loadDocument()"
                >{{ t('proto.tokenRetryDocument') }}</a-button
              >
            </div>
            <footer v-if="state.mode.value !== 'browse'" class="token-stage-actions">
              <a-checkbox
                v-if="
                  state.mode.value === 'import' && state.preview.value && !state.preview.value.valid
                "
                v-model:checked="state.allowInvalid.value"
                :disabled="disabled"
                >{{ t('proto.tokenInvalidAck') }}</a-checkbox
              >
              <div class="token-actions">
                <a-button :disabled="state.busy.value" @click="cancel">{{
                  t('proto.tokenCancel')
                }}</a-button
                ><a-button
                  type="primary"
                  :disabled="saveDisabled"
                  :loading="state.busy.value"
                  @click="state.save"
                  >{{
                    t(
                      state.mode.value === 'source'
                        ? 'proto.tokenSave'
                        : state.preview.value?.valid
                          ? 'proto.tokenImportConfirm'
                          : 'proto.tokenInspectImport',
                    )
                  }}</a-button
                >
              </div>
            </footer>
          </main>
        </div>
      </section>
    </div>
    <modal-context-holder />
  </teleport>
</template>
<style scoped>
.token-overlay {
  position: fixed;
  inset: 0;
  z-index: 1050;
  padding: var(--space-6);
  background: rgb(16 24 40 / 35%);
  display: flex;
  justify-content: center;
}
.token-workspace {
  width: min(1480px, 100%);
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: var(--radius);
  box-shadow: 0 12px 40px rgb(16 24 40 / 18%);
  overflow: hidden;
}
.token-header {
  padding: var(--space-4) var(--space-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
h1 {
  margin: 0;
  font-size: var(--text-title);
  line-height: 1.4;
}
h2 {
  margin: 0 0 var(--space-3);
  font-size: 19px;
  overflow-wrap: anywhere;
}
h3 {
  margin: 0 0 var(--space-3);
  font-size: 16px;
}
.token-heading {
  min-width: 0;
}
.token-heading p {
  margin: var(--space-1) 0 0;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}
.token-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.token-muted {
  color: var(--color-muted);
}
.token-feedback {
  padding: var(--space-3) var(--space-6);
  display: grid;
  gap: var(--space-2);
}
.token-feedback :deep(.ant-alert) {
  align-items: start;
}
.token-feedback :deep(.ant-alert-action) {
  max-width: 100%;
}
.token-notice {
  margin: 0;
}
.token-workspace-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
}
.token-package-pane {
  min-width: 0;
  overflow: auto;
  padding: var(--space-4);
  border-inline-end: 1px solid var(--color-border);
}
.token-list-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.token-package-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-4);
}
.token-package-list li + li {
  border-top: 1px solid var(--color-border);
}
.token-package-list button {
  display: grid;
  width: 100%;
  gap: var(--space-1);
  text-align: start;
  padding: var(--space-3);
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  overflow-wrap: anywhere;
}
.token-package-list button:hover,
.token-package-list button[aria-pressed='true'] {
  background: var(--color-background);
}
.token-package-list button[aria-pressed='true'] strong {
  color: var(--color-primary);
}
.token-package-list button:disabled {
  cursor: default;
  opacity: 0.65;
}
.token-package-list span {
  font-size: var(--text-small);
}
.token-main-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.token-main-content {
  padding: var(--space-6);
  overflow: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
.token-main-content > h2 {
  margin-bottom: 0;
}
.token-file-stage p {
  margin: 0 0 var(--space-3);
}
.token-file-stage span {
  overflow-wrap: anywhere;
  min-width: 0;
}
.token-stage-actions {
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--color-border);
  display: grid;
  gap: var(--space-3);
}
.token-stage-actions > .token-actions {
  justify-content: end;
}
.token-package-title {
  display: grid;
  gap: var(--space-3);
}
.token-package-title p {
  margin: 0;
}
.token-package-metadata summary,
.token-source-report summary {
  cursor: pointer;
}
.token-package-metadata dl,
.token-server-source dl {
  display: grid;
  grid-template-columns: minmax(80px, auto) 1fr;
  gap: var(--space-2) var(--space-4);
  margin-bottom: 0;
}
dt {
  color: var(--color-muted);
}
dd {
  margin: 0;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.token-source-report > .token-report {
  margin-top: var(--space-4);
}
.token-server-source {
  padding: var(--space-4);
  background: var(--color-background);
  border-radius: var(--radius);
}
.token-server-source .token-actions {
  margin-top: var(--space-4);
}
.token-server-source pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.token-empty {
  padding: var(--space-6) 0;
  color: var(--color-muted);
}
.token-empty p {
  margin: var(--space-2) 0 0;
}
.token-choose-package {
  margin: auto;
  text-align: center;
}
.token-mobile-back {
  display: none;
}
@media (max-width: 800px) {
  .token-workspace-body {
    grid-template-columns: 230px minmax(0, 1fr);
  }
  .token-header {
    padding-inline: var(--space-4);
  }
  .token-main-content {
    padding: var(--space-4);
  }
}
@media (max-width: 600px) {
  .token-overlay {
    padding: 0;
  }
  .token-workspace {
    border-radius: 0;
  }
  .token-header {
    gap: var(--space-2);
    align-items: start;
    padding: var(--space-3) var(--space-4);
  }
  h1 {
    font-size: 18px;
  }
  .token-heading p {
    font-size: var(--text-small);
  }
  .token-header > .token-actions {
    justify-content: end;
    flex-wrap: nowrap;
  }
  .token-header > .token-actions .ant-btn {
    padding-inline: var(--space-2);
  }
  .token-workspace-body {
    display: flex;
    flex-direction: column;
  }
  .token-package-pane,
  .token-main-pane {
    flex: 1;
  }
  .token-package-pane {
    border: 0;
  }
  .token-workspace[data-pane='list'] .token-main-pane,
  .token-workspace[data-pane='detail'] .token-package-pane {
    display: none;
  }
  .token-mobile-back {
    display: inline-flex;
    align-self: start;
  }
  .token-feedback {
    padding: var(--space-3) var(--space-4);
  }
  .token-feedback :deep(.ant-alert) {
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .token-feedback :deep(.ant-alert-action) {
    margin: 0;
  }
  .token-stage-actions {
    padding: var(--space-3) var(--space-4);
  }
  .token-package-metadata dl,
  .token-server-source dl {
    grid-template-columns: 1fr;
    gap: var(--space-1);
  }
  dd + dt {
    margin-top: var(--space-2);
  }
}
</style>
