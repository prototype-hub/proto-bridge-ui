<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import {
  Alert as AAlert,
  Button as AButton,
  Drawer as ADrawer,
  Pagination as APagination,
  Tag as ATag,
  Popconfirm as APopconfirm,
  Modal,
} from 'ant-design-vue'
import { PlusOutlined, SwapOutlined, ReloadOutlined, CloseOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { useSession } from '@/app/stores/session'
import { useViewportChecks } from '../hooks/useViewportChecks'
import {
  viewportCategories,
  viewportResults,
  type ViewportCheck,
  type ViewportDraft,
} from '../types/viewport-check'
import type { Project, Revision, ReviewPage, WorkspaceContext } from '../types'
import { runtimePageUrl } from '../utils/urls'

const props = defineProps<{
  project: Project
  revision: Revision
  context: WorkspaceContext
  initialPage?: ReviewPage
}>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const [modal, ModalContextHolder] = Modal.useModal()
const session = useSession()
const state = useViewportChecks(
  computed(() => ({
    project: props.project,
    revision: props.revision,
    context: props.context,
    initialPage: props.initialPage,
    actorId: session.user?.id || '',
  })),
)
const tab = ref<'preview' | 'records'>('preview')
const stage = ref<HTMLElement>()
const frameKey = ref(0),
  frameError = ref(false)
const editorDisabled = computed(
  () => !state.canEdit.value || state.locked.value || state.conflict.value,
)
const size = computed(() => ({
  width: dimension(state.form.viewportWidth, 1440),
  height: dimension(state.form.viewportHeight, 900),
  scale:
    Number.isInteger(state.form.viewportScale) &&
    state.form.viewportScale >= 25 &&
    state.form.viewportScale <= 200
      ? state.form.viewportScale / 100
      : 1,
}))
function dimension(value: number, fallback: number) {
  return Number.isInteger(value) && value >= 240 && value <= 3840 ? value : fallback
}
const frameUrl = computed(() => {
  if (state.denied.value || !state.target.value || !state.page.value) return undefined
  try {
    return runtimePageUrl(props.context.runtimeBaseUrl, state.page.value.path)
  } catch {
    return undefined
  }
})
const categories = computed(() =>
  viewportCategories.map((value) => ({ value, label: t(`proto.viewportCategory_${value}`) })),
)
const results = computed(() =>
  viewportResults.map((value) => ({ value, label: t(`proto.viewportResult_${value}`) })),
)
function confirmLeave(): Promise<boolean> {
  if (state.locked.value) return Promise.resolve(false)
  if (!state.dirty.value) return Promise.resolve(true)
  return new Promise((resolve) =>
    modal.confirm({
      title: t('proto.viewportLeaveTitle'),
      content: t('proto.viewportLeaveHint'),
      okText: t('proto.viewportLeave'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  )
}
async function close() {
  if (await confirmLeave()) emit('close')
}
async function selectPage(event: Event) {
  const element = event.target as HTMLSelectElement,
    id = element.value
  element.value = state.pageId.value
  if (await confirmLeave()) {
    state.selectPage(id)
    reloadFrame()
  }
}
async function select(row?: ViewportCheck) {
  if (!(await confirmLeave())) return
  state.select(row)
  frameError.value = false
  frameKey.value++
  tab.value = 'records'
  await nextTick()
  document.getElementById('viewport-title')?.focus()
}
function fit() {
  const element = stage.value
  if (!element) return
  const scale = Math.floor(
    Math.min(
      (element.clientWidth - 32) / size.value.width,
      (element.clientHeight - 32) / size.value.height,
    ) * 100,
  )
  state.form.viewportScale = Math.max(25, Math.min(200, scale))
}
async function preset(kind: 'desktop' | 'phone') {
  state.form.viewportWidth = kind === 'desktop' ? 1440 : 390
  state.form.viewportHeight = kind === 'desktop' ? 900 : 844
  tab.value = 'preview'
  await nextTick()
  fit()
}
function rotate() {
  ;[state.form.viewportWidth, state.form.viewportHeight] = [
    state.form.viewportHeight,
    state.form.viewportWidth,
  ]
}
function reloadFrame() {
  frameKey.value++
  frameError.value = false
}
async function save() {
  state.save()
  await nextTick()
  const key = Object.keys(state.invalid)[0] as keyof ViewportDraft | undefined
  if (key) {
    tab.value = key.startsWith('viewport') ? 'preview' : 'records'
    await nextTick()
    const id =
      (
        { viewportWidth: 'width', viewportHeight: 'height', viewportScale: 'scale' } as Record<
          string,
          string
        >
      )[key] || key
    document.getElementById(`viewport-${id}`)?.focus()
  }
}
onBeforeRouteLeave(confirmLeave)
onBeforeRouteUpdate(confirmLeave)
watch(state.busy, async (value, previous) => {
  if (value || !previous) return
  await nextTick()
  document
    .getElementById(
      state.unknown.value
        ? 'viewport-retry'
        : state.conflict.value || state.denied.value
          ? 'viewport-read'
          : 'viewport-save',
    )
    ?.focus()
})
function unload(event: BeforeUnloadEvent) {
  if (state.dirty.value || state.locked.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', unload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', unload))
</script>
<template>
  <a-drawer
    :open="true"
    width="100vw"
    root-class-name="viewport-check-drawer"
    :closable="false"
    :keyboard="!state.locked.value"
    :mask-closable="false"
    @close="close"
  >
    <template #title
      ><span
        >{{ t('proto.viewportChecks')
        }}<span class="viewport-heading-page"> · {{ state.page.value?.name }}</span></span
      ></template
    >
    <template #extra
      ><a-button
        type="text"
        :aria-label="t('common.close')"
        :title="t('common.close')"
        :disabled="state.locked.value"
        @click="close"
        ><close-outlined aria-hidden="true" /></a-button
    ></template>
    <section
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.viewportChecks')"
      class="viewport-workspace"
    >
      <header class="viewport-context">
        <div class="viewport-context-name">
          <strong>{{ project.name }}</strong
          ><span>{{ revision.versionName }}</span>
          <details>
            <summary>{{ t('proto.viewportScope', { revision: revision.id }) }}</summary>
            <p>{{ t('proto.viewportRevisionHint') }}</p>
          </details>
        </div>
        <div class="viewport-page-select">
          <label for="viewport-page">{{ t('proto.viewportPage') }}</label
          ><select
            id="viewport-page"
            :value="state.pageId.value"
            :disabled="state.locked.value"
            @change="selectPage"
          >
            <option v-for="page in state.pages.value" :key="page.pageId" :value="page.pageId">
              {{ page.name }} · {{ page.path }}
            </option>
          </select>
        </div>
      </header>
      <a-alert
        v-if="state.error.value"
        class="viewport-alert"
        :type="state.unknown.value || state.conflict.value ? 'warning' : 'error'"
        show-icon
        :message="state.error.value"
        role="alert"
      >
        <template #action
          ><a-button
            v-if="state.unknown.value"
            id="viewport-retry"
            :loading="state.busy.value"
            @click="state.retry"
            >{{ t('proto.viewportRetry') }}</a-button
          ><a-button v-else id="viewport-read" :loading="state.loading.value" @click="state.load">{{
            t('proto.viewportReloadRecords')
          }}</a-button></template
        >
      </a-alert>
      <p
        v-if="state.notice.value && !state.error.value"
        class="viewport-notice"
        role="status"
        aria-live="polite"
      >
        {{ state.notice.value }}
      </p>
      <nav class="viewport-mobile-tabs" :aria-label="t('proto.viewportChecks')">
        <a-button
          :type="tab === 'preview' ? 'primary' : 'default'"
          :aria-pressed="tab === 'preview'"
          @click="tab = 'preview'"
          >{{ t('proto.viewportPreview') }}</a-button
        ><a-button
          :type="tab === 'records' ? 'primary' : 'default'"
          :aria-pressed="tab === 'records'"
          @click="tab = 'records'"
          >{{ t('proto.viewportRecords') }}</a-button
        >
      </nav>
      <div class="viewport-body" :class="`viewport-tab-${tab}`">
        <section class="viewport-preview" :aria-label="t('proto.viewportPreview')">
          <div class="viewport-controls">
            <div class="viewport-presets">
              <a-button
                :disabled="state.locked.value || state.conflict.value"
                @click="preset('desktop')"
                >{{ t('proto.viewportDesktop') }}</a-button
              ><a-button
                :disabled="state.locked.value || state.conflict.value"
                @click="preset('phone')"
                >{{ t('proto.viewportMobile') }}</a-button
              ><a-button
                :disabled="state.locked.value || state.conflict.value"
                :aria-label="t('proto.viewportRotate')"
                :title="t('proto.viewportRotate')"
                @click="rotate"
                ><swap-outlined aria-hidden="true"
              /></a-button>
            </div>
            <div class="viewport-numbers">
              <div
                v-for="field in ['Width', 'Height'] as const"
                :key="field"
                class="viewport-number"
              >
                <label :for="`viewport-${field.toLowerCase()}`">{{
                  t(`proto.viewport${field}`)
                }}</label
                ><input
                  :id="`viewport-${field.toLowerCase()}`"
                  v-model.number="state.form[`viewport${field}`]"
                  type="number"
                  min="240"
                  max="3840"
                  step="1"
                  :disabled="state.locked.value || state.conflict.value"
                  :aria-invalid="!!state.invalid[`viewport${field}`]"
                  :aria-describedby="
                    state.invalid[`viewport${field}`] ? `viewport-${field}-error` : undefined
                  "
                /><span
                  v-if="state.invalid[`viewport${field}`]"
                  :id="`viewport-${field}-error`"
                  class="viewport-field-error"
                  >{{ state.invalid[`viewport${field}`] }}</span
                >
              </div>
              <div class="viewport-number viewport-scale">
                <label for="viewport-scale">{{ t('proto.viewportScale') }} %</label
                ><input
                  id="viewport-scale"
                  v-model.number="state.form.viewportScale"
                  type="number"
                  min="25"
                  max="200"
                  step="1"
                  :disabled="state.locked.value || state.conflict.value"
                  :aria-invalid="!!state.invalid.viewportScale"
                  :aria-describedby="
                    state.invalid.viewportScale ? 'viewport-scale-error' : undefined
                  "
                /><span
                  v-if="state.invalid.viewportScale"
                  id="viewport-scale-error"
                  class="viewport-field-error"
                  >{{ state.invalid.viewportScale }}</span
                >
              </div>
            </div>
            <a-button :disabled="state.locked.value || state.conflict.value" @click="fit">{{
              t('proto.viewportFit')
            }}</a-button>
          </div>
          <div class="viewport-stage-caption">
            <span translate="no"
              >{{ t('proto.viewportDimensions', { width: size.width, height: size.height }) }} ·
              {{ Math.round(size.scale * 100) }}%</span
            ><a-button
              size="small"
              :disabled="!frameUrl"
              :aria-label="t('proto.viewportReload')"
              :title="t('proto.viewportReload')"
              @click="reloadFrame"
              ><reload-outlined aria-hidden="true"
            /></a-button>
          </div>
          <a-alert
            v-if="frameError"
            type="error"
            :message="t('proto.viewportFrameError')"
            show-icon
          />
          <div
            ref="stage"
            class="viewport-stage"
            :aria-label="t('proto.viewportStage')"
            role="region"
            tabindex="0"
          >
            <div
              v-if="frameUrl"
              class="viewport-clip"
              :style="{
                width: `${size.width * size.scale}px`,
                height: `${size.height * size.scale}px`,
              }"
            >
              <iframe
                :key="`${frameUrl}:${frameKey}`"
                :src="frameUrl"
                :title="t('proto.viewportFrame')"
                sandbox="allow-scripts allow-forms"
                referrerpolicy="no-referrer"
                :style="{
                  width: `${size.width}px`,
                  height: `${size.height}px`,
                  transform: `scale(${size.scale})`,
                }"
                @error="frameError = true"
              />
            </div>
          </div>
          <details class="viewport-method">
            <summary>{{ t('proto.viewportMethod') }}</summary>
            <p>{{ t('proto.viewportMethodHint') }}</p>
          </details>
        </section>
        <aside class="viewport-records" :aria-label="t('proto.viewportRecords')">
          <div class="viewport-record-heading">
            <h2>{{ t('proto.viewportRecords') }}</h2>
            <a-button v-if="state.canEdit.value" :disabled="state.locked.value" @click="select()"
              ><plus-outlined aria-hidden="true" />{{ t('proto.viewportNew') }}</a-button
            >
          </div>
          <p v-if="!state.canEdit.value && !state.denied.value" class="viewport-readonly">
            {{ t('proto.viewportReadOnly') }}
          </p>
          <div class="viewport-filters">
            <div>
              <label for="viewport-filter-category">{{ t('proto.viewportCategory') }}</label
              ><select
                id="viewport-filter-category"
                v-model="state.filters.category"
                :disabled="state.locked.value"
              >
                <option value="">{{ t('proto.viewportAllCategories') }}</option>
                <option
                  v-for="category in categories"
                  :key="category.value"
                  :value="category.value"
                >
                  {{ category.label }}
                </option>
              </select>
            </div>
            <div>
              <label for="viewport-filter-result">{{ t('proto.viewportResult') }}</label
              ><select
                id="viewport-filter-result"
                v-model="state.filters.result"
                :disabled="state.locked.value"
              >
                <option value="">{{ t('proto.viewportAllResults') }}</option>
                <option v-for="result in results" :key="result.value" :value="result.value">
                  {{ result.label }}
                </option>
              </select>
            </div>
            <a-button
              :loading="state.loading.value"
              :disabled="state.locked.value"
              @click="state.query()"
              >{{ t('proto.viewportFilter') }}</a-button
            >
          </div>
          <p v-if="state.result.value" class="viewport-count">
            {{ t('proto.viewportRecordCount', { count: state.result.value.total }) }}
          </p>
          <ul v-if="state.result.value?.data.length" class="viewport-record-list">
            <li v-for="row in state.result.value.data" :key="row.id">
              <button
                type="button"
                class="viewport-record"
                :class="{ selected: state.original.value?.id === row.id }"
                :disabled="state.locked.value"
                :aria-label="t('proto.viewportApply', { title: row.title })"
                :aria-pressed="state.original.value?.id === row.id"
                @click="select(row)"
              >
                <span class="viewport-record-title">{{ row.title }}</span
                ><span class="viewport-record-meta"
                  ><a-tag
                    :color="
                      row.result.value === 'passed'
                        ? 'success'
                        : row.result.value === 'failed'
                          ? 'error'
                          : 'default'
                    "
                    >{{ t(`proto.viewportResult_${row.result.value}`) }}</a-tag
                  ><span>{{ t(`proto.viewportCategory_${row.category.value}`) }}</span
                  ><span translate="no"
                    >{{ row.viewportWidth }} × {{ row.viewportHeight }}</span
                  ></span
                >
              </button>
            </li>
          </ul>
          <div v-else-if="!state.loading.value && !state.error.value" class="viewport-empty">
            <strong>{{
              t(
                state.filters.category || state.filters.result
                  ? 'proto.viewportNoMatches'
                  : 'proto.viewportEmpty',
              )
            }}</strong>
            <p v-if="!state.filters.category && !state.filters.result">
              {{ t('proto.viewportEmptyHint') }}
            </p>
          </div>
          <a-pagination
            v-if="state.result.value && state.result.value.total > 20"
            class="viewport-pagination"
            size="small"
            :current="state.pageIndex.value + 1"
            :total="state.result.value.total"
            :page-size="20"
            :show-size-changer="false"
            :disabled="state.locked.value"
            @change="state.query($event - 1)"
          />
          <form class="viewport-editor" @submit.prevent="save">
            <h3>
              {{
                t(state.original.value ? 'proto.viewportEditHeading' : 'proto.viewportNewHeading')
              }}
            </h3>
            <div class="viewport-field">
              <label for="viewport-title"
                >{{ t('proto.viewportTitle') }} <span aria-hidden="true">*</span></label
              ><input
                id="viewport-title"
                v-model="state.form.title"
                type="text"
                maxlength="120"
                required
                :placeholder="t('proto.viewportTitlePlaceholder')"
                :disabled="editorDisabled"
                :aria-invalid="!!state.invalid.title"
                :aria-describedby="state.invalid.title ? 'viewport-title-error' : undefined"
              /><span
                v-if="state.invalid.title"
                id="viewport-title-error"
                class="viewport-field-error"
                >{{ state.invalid.title }}</span
              >
            </div>
            <div class="viewport-field">
              <label for="viewport-category">{{ t('proto.viewportCategory') }}</label
              ><select
                id="viewport-category"
                v-model="state.form.category"
                :disabled="editorDisabled"
              >
                <option
                  v-for="category in categories"
                  :key="category.value"
                  :value="category.value"
                >
                  {{ category.label }}
                </option>
              </select>
            </div>
            <div class="viewport-field">
              <label for="viewport-expected"
                >{{ t('proto.viewportExpected') }} <span aria-hidden="true">*</span></label
              ><textarea
                id="viewport-expected"
                v-model="state.form.expected"
                rows="3"
                maxlength="2000"
                required
                :placeholder="t('proto.viewportExpectedPlaceholder')"
                :disabled="editorDisabled"
                :aria-invalid="!!state.invalid.expected"
                :aria-describedby="state.invalid.expected ? 'viewport-expected-error' : undefined"
              /><span
                v-if="state.invalid.expected"
                id="viewport-expected-error"
                class="viewport-field-error"
                >{{ state.invalid.expected }}</span
              >
            </div>
            <div class="viewport-field">
              <label for="viewport-result">{{ t('proto.viewportResult') }}</label
              ><select id="viewport-result" v-model="state.form.result" :disabled="editorDisabled">
                <option v-for="result in results" :key="result.value" :value="result.value">
                  {{ result.label }}
                </option>
              </select>
            </div>
            <div class="viewport-field">
              <label for="viewport-observed"
                >{{ t('proto.viewportObserved') }}
                <span v-if="state.form.result !== 'untested'" aria-hidden="true">*</span></label
              ><textarea
                id="viewport-observed"
                v-model="state.form.observed"
                rows="3"
                maxlength="2000"
                :placeholder="t('proto.viewportObservedPlaceholder')"
                :disabled="editorDisabled"
                :aria-invalid="!!state.invalid.observed"
                :aria-describedby="state.invalid.observed ? 'viewport-observed-error' : undefined"
              /><span
                v-if="state.invalid.observed"
                id="viewport-observed-error"
                class="viewport-field-error"
                >{{ state.invalid.observed }}</span
              >
            </div>
            <details class="viewport-evidence">
              <summary>{{ t('proto.viewportDetails') }}</summary>
              <div class="viewport-field">
                <label for="viewport-steps">{{ t('proto.viewportSteps') }}</label
                ><textarea
                  id="viewport-steps"
                  v-model="state.form.steps"
                  rows="3"
                  maxlength="2000"
                  :disabled="editorDisabled"
                />
              </div>
              <div class="viewport-field">
                <label for="viewport-evidence">{{ t('proto.viewportEvidence') }}</label
                ><textarea
                  id="viewport-evidence"
                  v-model="state.form.evidence"
                  rows="3"
                  maxlength="2000"
                  :disabled="editorDisabled"
                  aria-describedby="viewport-evidence-hint"
                /><span id="viewport-evidence-hint" class="viewport-field-hint">{{
                  t('proto.viewportEvidenceHint')
                }}</span>
              </div>
            </details>
            <div class="viewport-editor-actions">
              <a-button
                v-if="state.canEdit.value"
                id="viewport-save"
                type="primary"
                html-type="submit"
                :loading="state.busy.value"
                :disabled="state.locked.value || state.conflict.value"
                >{{ t('proto.viewportSave') }}</a-button
              ><a-button
                v-if="state.dirty.value || state.conflict.value"
                :disabled="state.locked.value"
                @click="select()"
                >{{ t('proto.viewportDiscard') }}</a-button
              ><a-popconfirm
                v-if="state.canEdit.value && state.original.value"
                :title="t('proto.viewportDeleteConfirm')"
                :ok-text="t('proto.viewportDelete')"
                :cancel-text="t('common.cancel')"
                @confirm="state.remove"
                ><a-button
                  danger
                  :disabled="state.locked.value || state.conflict.value || state.dirty.value"
                  >{{ t('proto.viewportDelete') }}</a-button
                ></a-popconfirm
              >
            </div>
          </form>
        </aside>
      </div>
    </section>
    <modal-context-holder />
  </a-drawer>
</template>
<style>
.viewport-check-drawer .ant-drawer-body {
  padding: 0;
  overflow: hidden;
}
.viewport-check-drawer .ant-drawer-header {
  padding: 12px 20px;
}
.viewport-workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--color-text);
}
.viewport-heading-page {
  font-weight: 400;
  color: var(--color-muted);
}
.viewport-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border);
}
.viewport-context-name {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 16px;
  min-width: 0;
}
.viewport-context-name strong {
  font-size: 16px;
  overflow-wrap: anywhere;
}
.viewport-context-name > span {
  color: var(--color-muted);
}
.viewport-context-name details {
  font-size: 12px;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}
.viewport-context-name details p {
  margin: 8px 0 0;
}
.viewport-page-select {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 350px;
  min-width: 200px;
}
.viewport-page-select label {
  white-space: nowrap;
}
.viewport-workspace select,
.viewport-workspace input,
.viewport-workspace textarea {
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 5px 10px;
  min-height: 32px;
  min-width: 0;
  width: 100%;
}
.viewport-workspace textarea {
  resize: vertical;
  min-height: 70px;
}
.viewport-workspace select:focus-visible,
.viewport-workspace input:focus-visible,
.viewport-workspace textarea:focus-visible,
.viewport-workspace summary:focus-visible,
.viewport-workspace button:focus-visible,
.viewport-stage:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.viewport-workspace input::placeholder,
.viewport-workspace textarea::placeholder {
  color: var(--color-muted);
}
.viewport-workspace [disabled] {
  cursor: not-allowed;
  color: var(--color-muted);
  background-color: var(--color-background);
}
.viewport-workspace [aria-invalid='true'] {
  border-color: #b42318;
}
.viewport-workspace summary {
  cursor: pointer;
}
.viewport-alert {
  margin: 12px 20px 0;
  flex: none;
}
.viewport-alert .ant-alert-action {
  margin-left: 12px;
}
.viewport-notice {
  margin: 10px 20px 0;
  color: #20713e;
}
.viewport-mobile-tabs {
  display: none;
}
.viewport-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 390px;
  flex: 1;
  min-height: 0;
}
.viewport-preview {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.viewport-controls {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 20px;
}
.viewport-presets {
  display: flex;
  gap: 6px;
}
.viewport-numbers {
  display: flex;
  align-items: start;
  gap: 8px;
}
.viewport-number {
  width: 86px;
}
.viewport-number label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--color-muted);
}
.viewport-number input {
  font-variant-numeric: tabular-nums;
}
.viewport-number.viewport-scale {
  width: 100px;
}
.viewport-stage-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 20px 8px;
  color: var(--color-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.viewport-stage {
  flex: 1;
  min-height: 180px;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 16px;
  background: var(--color-background);
}
.viewport-clip {
  position: relative;
  overflow: hidden;
  margin: 0 auto;
  flex: none;
  background: var(--color-surface);
  box-shadow: 0 2px 12px rgb(16 24 40 / 12%);
}
.viewport-clip iframe {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
  border: 0;
  background: var(--color-surface);
}
.viewport-method {
  flex: none;
  padding: 10px 20px;
  border-top: 1px solid var(--color-border);
  color: var(--color-muted);
  font-size: 12px;
}
.viewport-method p {
  max-width: 75ch;
  margin: 8px 0 0;
}
.viewport-records {
  min-width: 0;
  overflow: auto;
  padding: 20px;
  border-left: 1px solid var(--color-border);
  overscroll-behavior: contain;
}
.viewport-record-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;
}
.viewport-record-heading h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.viewport-readonly {
  font-size: 13px;
  color: var(--color-muted);
}
.viewport-filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}
.viewport-filters label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--color-muted);
}
.viewport-filters > button {
  grid-column: 1 / -1;
}
.viewport-count {
  margin: 12px 0 8px;
  color: var(--color-muted);
  font-size: 12px;
}
.viewport-record-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow: auto;
}
.viewport-record {
  display: block;
  text-align: left;
  width: 100%;
  padding: 10px;
  border: 1px solid transparent;
  border-bottom-color: var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}
.viewport-record:hover {
  background: var(--color-background);
}
.viewport-record.selected {
  border-color: var(--color-primary);
  background: #f0f7ff;
}
.viewport-record-title {
  display: block;
  font-weight: 500;
  overflow-wrap: anywhere;
  margin-bottom: 5px;
}
.viewport-record-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--color-muted);
}
.viewport-record-meta .ant-tag {
  margin: 0;
}
.viewport-empty {
  padding: 20px 0;
}
.viewport-empty strong {
  font-weight: 500;
}
.viewport-empty p {
  margin: 6px 0 0;
  color: var(--color-muted);
  font-size: 13px;
}
.viewport-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.viewport-editor {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}
.viewport-editor h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px;
}
.viewport-field {
  margin-bottom: 16px;
}
.viewport-field > label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}
.viewport-field > label > span {
  color: #b42318;
}
.viewport-field-error {
  display: block;
  font-size: 12px;
  color: #b42318;
  margin-top: 4px;
}
.viewport-field-hint {
  display: block;
  font-size: 12px;
  color: var(--color-muted);
  margin-top: 6px;
}
.viewport-evidence {
  margin: 8px 0 20px;
}
.viewport-evidence summary {
  color: var(--color-muted);
  margin-bottom: 12px;
}
.viewport-editor-actions {
  position: sticky;
  bottom: -20px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 0 20px;
  background: var(--color-surface);
}
.viewport-workspace ::selection {
  color: var(--color-text);
  background: #d6e9ff;
}
@media (max-width: 800px) {
  .viewport-check-drawer .ant-drawer-header {
    padding: 10px 12px;
  }
  .viewport-context {
    padding: 10px 12px;
    gap: 8px;
    align-items: stretch;
    flex-direction: column;
  }
  .viewport-context-name {
    gap: 4px 12px;
  }
  .viewport-context-name details {
    width: 100%;
  }
  .viewport-page-select {
    flex: none;
    min-width: 0;
  }
  .viewport-mobile-tabs {
    display: flex;
    gap: 8px;
    padding: 10px 12px 0;
  }
  .viewport-mobile-tabs > button {
    flex: 1;
    min-width: 0;
  }
  .viewport-body {
    display: flex;
  }
  .viewport-preview,
  .viewport-records {
    flex: 1;
  }
  .viewport-tab-preview .viewport-records,
  .viewport-tab-records .viewport-preview {
    display: none;
  }
  .viewport-controls {
    padding: 12px;
    gap: 10px;
  }
  .viewport-numbers {
    order: 2;
    width: 100%;
  }
  .viewport-number,
  .viewport-number.viewport-scale {
    flex: 1;
    width: auto;
  }
  .viewport-stage-caption {
    padding: 0 12px 8px;
  }
  .viewport-stage {
    padding: 12px;
  }
  .viewport-method {
    padding: 10px 12px;
  }
  .viewport-records {
    padding: 16px 12px;
    border-left: 0;
  }
  .viewport-alert {
    margin: 10px 12px 0;
  }
  .viewport-alert .ant-alert-content {
    min-width: 0;
  }
  .viewport-alert .ant-alert-action {
    margin: 8px 0 0;
    width: 100%;
  }
  .viewport-alert {
    flex-wrap: wrap;
  }
  .viewport-notice {
    margin: 8px 12px 0;
  }
  .viewport-editor-actions {
    bottom: -16px;
  }
}
</style>
