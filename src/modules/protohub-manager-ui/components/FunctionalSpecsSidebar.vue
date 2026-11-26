<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import {
  Alert as AAlert,
  Button as AButton,
  Pagination as APagination,
  Modal,
} from 'ant-design-vue'
import { ArrowLeftOutlined, CloseOutlined, PlusOutlined, AimOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { useSession } from '@/app/stores/session'
import { useFunctionalSpecs } from '../hooks/useFunctionalSpecs'
import { isReviewAnchor } from '../utils/review-anchor'
import type { FunctionalSpec } from '../types/functional-spec'
import type { Project, Revision, ReviewAnchor, ReviewPage, WorkspaceContext } from '../types'

const props = defineProps<{
  project: Project
  revision: Revision
  context: WorkspaceContext
  page: ReviewPage
}>()
const emit = defineEmits<{
  close: []
  capture: [shape: ReviewAnchor['shape']]
  locate: [anchor: ReviewAnchor]
  clear: []
}>()
const { t } = useI18n(),
  session = useSession()
const [modal, ModalContextHolder] = Modal.useModal()
const page = ref(props.page)
const scope = computed(() =>
  session.user?.id
    ? {
        actorId: session.user.id,
        project: props.project,
        revision: props.revision,
        context: props.context,
        page: page.value,
      }
    : undefined,
)
const state = useFunctionalSpecs(scope)
const root = ref<HTMLElement>(),
  drawing = ref(false),
  locating = ref(false)
const narrow = ref(window.innerWidth <= 1100)
const mobileEditor = ref(false),
  geometryNotice = ref('')
const mismatch = computed(
  () =>
    props.page.pageId !== page.value.pageId ||
    props.page.revisionId !== page.value.revisionId ||
    props.page.path !== page.value.path,
)
const editorDisabled = computed(
  () => !state.canEdit.value || state.locked.value || state.conflict.value,
)
const secondaryFields = ['inputRules', 'permissionRules', 'navigationRules', 'notes'] as const
const fieldKeys = {
  inputRules: 'specInputRules',
  permissionRules: 'specPermissionRules',
  navigationRules: 'specNavigationRules',
  notes: 'specNotes',
}
let captureScope = ''
let approvedPage = ''
const identity = () =>
  JSON.stringify([
    session.user?.id,
    props.project.id,
    props.revision.id,
    page.value.pageId,
    page.value.path,
  ])
function confirmLeave(): Promise<boolean> {
  if (state.locked.value) {
    state.error.value = t('proto.specCloseBlocked')
    return Promise.resolve(false)
  }
  if (!state.dirty.value) return Promise.resolve(true)
  return new Promise((resolve) =>
    modal.confirm({
      title: t('proto.specDiscardTitle'),
      content: t('proto.specDiscardHint'),
      okText: t('proto.specDiscard'),
      cancelText: t('proto.specKeep'),
      okButtonProps: { danger: true },
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  )
}
async function close() {
  if (await confirmLeave()) {
    emit('clear')
    emit('close')
  }
}
async function select(row?: FunctionalSpec) {
  if (!(await confirmLeave())) return
  emit('clear')
  geometryNotice.value = ''
  state.select(row)
  mobileEditor.value = true
  await nextTick()
  document.getElementById('spec-title')?.focus()
}
async function back() {
  if (!(await confirmLeave())) return
  state.select(state.original.value)
  state.editing.value = false
  mobileEditor.value = false
  await nextTick()
  root.value
    ?.querySelector<HTMLButtonElement>('.spec-record[aria-pressed="true"], .spec-new')
    ?.focus()
}
async function followPage() {
  if (!(await confirmLeave())) return
  cancelGeometry()
  page.value = props.page
  mobileEditor.value = false
}
function cancelGeometry() {
  captureScope = ''
  drawing.value = locating.value = false
  emit('clear')
}
async function capture(shape: ReviewAnchor['shape']) {
  if (editorDisabled.value || mismatch.value) return
  captureScope = identity()
  locating.value = false
  drawing.value = true
  geometryNotice.value = ''
  await nextTick()
  emit('capture', shape)
}
async function receiveAnchor(anchor?: ReviewAnchor) {
  if (
    !drawing.value ||
    captureScope !== identity() ||
    mismatch.value ||
    !state.canEdit.value ||
    state.locked.value
  )
    return
  if (anchor && isReviewAnchor(anchor)) state.form.anchor = { ...anchor }
  else geometryNotice.value = t('proto.specCaptureCancelled')
  captureScope = ''
  drawing.value = false
  await nextTick()
  document.getElementById('spec-area')?.focus()
}
function removeArea() {
  state.form.anchor = null
  emit('clear')
}
function locate() {
  if (!state.form.anchor || mismatch.value) return
  geometryNotice.value = t('proto.specLocatedHint')
  locating.value = true
  emit('locate', { ...state.form.anchor })
}
function runtimeReady() {
  if (drawing.value) {
    cancelGeometry()
    geometryNotice.value = t('proto.specCaptureCancelled')
  }
}
function returnToEditor() {
  locating.value = false
  emit('clear')
  void nextTick(() => document.getElementById('spec-area')?.focus())
}
async function save() {
  state.save()
  await nextTick()
  const key = Object.keys(state.invalid)[0]
  if (key) document.getElementById(`spec-${key}`)?.focus()
}
function remove() {
  if (!state.original.value) return
  modal.confirm({
    title: t('proto.specDeleteTitle', { title: state.original.value.title }),
    content: t('proto.specDeleteHint'),
    okText: t('proto.specDelete'),
    cancelText: t('common.cancel'),
    okButtonProps: { danger: true },
    onOk: () => state.remove(),
  })
}
function resize() {
  narrow.value = window.innerWidth <= 1100
}
function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !narrow.value || drawing.value || locating.value) return
  const elements = [
    ...(root.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
    ) || []),
  ].filter((element) => element.getClientRects().length > 0)
  const first = elements[0],
    last = elements[elements.length - 1]
  if (
    event.shiftKey &&
    (document.activeElement === first || !elements.includes(document.activeElement as HTMLElement))
  ) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
async function checkConflict() {
  if (state.original.value) await state.readConflict()
  else {
    await state.load()
    mobileEditor.value = false
    await nextTick()
    document.getElementById('spec-search')?.focus()
  }
}
onMounted(async () => {
  window.addEventListener('resize', resize)
  await nextTick()
  document.getElementById('spec-heading')?.focus()
})
function unload(event: BeforeUnloadEvent) {
  if (state.dirty.value || state.locked.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', unload)
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', unload)
  window.removeEventListener('resize', resize)
  emit('clear')
})
onBeforeRouteLeave(confirmLeave)
onBeforeRouteUpdate(async (to) => {
  const allowed = await confirmLeave()
  approvedPage = allowed && typeof to.query.pageId === 'string' ? to.query.pageId : ''
  return allowed
})
watch(
  () => [props.page.pageId, props.page.revisionId, props.page.path],
  async () => {
    cancelGeometry()
    if (approvedPage === props.page.pageId) {
      state.select(state.original.value)
      approvedPage = ''
    }
    if (!state.dirty.value && !state.locked.value) page.value = props.page
  },
)
watch(
  () => [session.user?.id, state.canEdit.value, props.revision.id],
  () => {
    cancelGeometry()
    geometryNotice.value = ''
  },
)
watch(state.notice, async (value) => {
  if (!value) return
  await nextTick()
  document.getElementById('spec-notice')?.focus()
})
watch(state.denied, (value) => {
  if (value) {
    cancelGeometry()
    mobileEditor.value = false
  }
})
defineExpose({ receiveAnchor, runtimeReady, confirmLeave })
</script>
<template>
  <aside
    ref="root"
    class="functional-sidebar"
    :class="{
      'spec-drawing': drawing,
      'spec-locating': locating,
      'spec-mobile-editor': mobileEditor,
    }"
    :aria-label="t('proto.functionalSpecs')"
    :role="narrow && !drawing && !locating ? 'dialog' : 'complementary'"
    :aria-modal="narrow && !drawing && !locating ? true : undefined"
    @keydown="trapFocus"
    @keydown.esc.stop="close"
  >
    <div v-if="drawing || locating" class="spec-return-strip" role="status">
      <span>{{ t(drawing ? 'proto.specDrawing' : 'proto.specLocatedHint') }}</span>
      <a-button
        @click="
          drawing
            ? (cancelGeometry(), (geometryNotice = t('proto.specCaptureCancelled')))
            : returnToEditor()
        "
        >{{ t('proto.specReturn') }}</a-button
      >
    </div>
    <div class="spec-panel" :inert="drawing || locating" :aria-hidden="drawing || locating">
      <header class="spec-header">
        <div>
          <h2 id="spec-heading" tabindex="-1">{{ t('proto.functionalSpecs') }}</h2>
          <p>{{ t('proto.specSnapshot', { page: page.name }) }}</p>
        </div>
        <a-button type="text" :aria-label="t('proto.specClose')" @click="close"
          ><close-outlined aria-hidden="true"
        /></a-button>
      </header>
      <div v-if="mismatch" class="spec-scope-change" role="status">
        <p>{{ t('proto.specPageChanged', { page: page.name }) }}</p>
        <a-button :disabled="state.locked.value" @click="followPage">{{
          t('proto.specFollowPage')
        }}</a-button>
      </div>
      <a-alert
        v-if="state.error.value"
        class="spec-alert"
        :message="state.error.value"
        type="warning"
        show-icon
        role="alert"
        ><template #action
          ><a-button v-if="state.unknown.value" :loading="state.busy.value" @click="state.retry">{{
            t('proto.specRetry')
          }}</a-button
          ><a-button
            v-else-if="state.conflict.value"
            :loading="state.loading.value"
            @click="checkConflict"
            >{{
              t(state.original.value ? 'proto.specReadServer' : 'proto.specCheckList')
            }}</a-button
          ><a-button v-else :loading="state.loading.value" @click="state.load">{{
            t('common.retry')
          }}</a-button></template
        ></a-alert
      >
      <p v-if="state.notice.value" id="spec-notice" class="spec-notice" tabindex="-1" role="status">
        {{ state.notice.value }}
      </p>
      <div class="spec-body">
        <section class="spec-catalog" :aria-label="t('proto.specBack')">
          <a-button
            v-if="state.canEdit.value"
            class="spec-new"
            type="primary"
            :disabled="state.locked.value"
            @click="select()"
            ><plus-outlined aria-hidden="true" />{{ t('proto.specNew') }}</a-button
          >
          <a-button
            v-if="state.editing.value && !mobileEditor"
            class="spec-kept-draft"
            @click="mobileEditor = true"
            >{{ t('proto.specShowDraft') }}</a-button
          >
          <form class="spec-search" @submit.prevent="state.query()">
            <label class="sr-only" for="spec-search">{{ t('proto.specSearch') }}</label
            ><input
              id="spec-search"
              v-model="state.search.value"
              name="titleSearch"
              autocomplete="off"
              type="search"
              :placeholder="t('proto.specSearch')"
              :disabled="state.locked.value"
            /><a-button
              html-type="submit"
              :disabled="state.locked.value"
              :loading="state.loading.value"
              >{{ t('proto.specFilter') }}</a-button
            >
          </form>
          <p class="spec-count" aria-live="polite">
            {{
              state.loading.value
                ? t('proto.specLoading')
                : t('proto.specCount', { count: state.result.value?.total || 0 })
            }}
          </p>
          <ul v-if="state.result.value?.data.length" class="spec-list">
            <li v-for="row in state.result.value.data" :key="row.id">
              <button
                type="button"
                class="spec-record"
                :aria-pressed="state.original.value?.id === row.id"
                :disabled="state.locked.value"
                @click="select(row)"
              >
                <strong>{{ row.title }}</strong
                ><span v-if="row.purpose">{{ row.purpose }}</span>
              </button>
            </li>
          </ul>
          <p v-else-if="!state.loading.value && !state.error.value" class="spec-empty">
            {{ t(state.appliedSearch.value ? 'proto.specNoMatches' : 'proto.specEmpty') }}
          </p>
          <a-pagination
            v-if="state.result.value && state.result.value.total > 20"
            size="small"
            simple
            :current="state.pageIndex.value + 1"
            :total="state.result.value.total"
            :page-size="20"
            :show-size-changer="false"
            :disabled="state.locked.value"
            @change="state.query($event - 1)"
          />
          <details class="spec-scope">
            <summary>{{ t('proto.specScopeDetails') }}</summary>
            <p>{{ t('proto.specScopeHint') }}</p>
          </details>
        </section>
        <section
          class="spec-detail"
          :aria-label="state.original.value?.title || t('proto.specNewHeading')"
        >
          <a-button class="spec-back" type="text" @click="back"
            ><arrow-left-outlined aria-hidden="true" />{{ t('proto.specBack') }}</a-button
          >
          <p v-if="!state.editing.value" class="spec-select">{{ t('proto.specSelect') }}</p>
          <form v-else novalidate @submit.prevent="save">
            <div class="spec-editor-fields">
              <div class="spec-editor-heading">
                <h3>{{ state.original.value?.title || t('proto.specNewHeading') }}</h3>
                <span v-if="!state.canEdit.value">{{ t('proto.specReadOnly') }}</span>
              </div>
              <div v-if="state.serverRecord.value" class="spec-server">
                <h4>{{ t('proto.specServerHeading') }}</h4>
                <dl>
                  <template
                    v-for="key in ['title', 'purpose', ...secondaryFields] as const"
                    :key="key"
                    ><dt>
                      {{
                        t(
                          `proto.${key === 'title' ? 'specTitle' : key === 'purpose' ? 'specPurpose' : fieldKeys[key]}`,
                        )
                      }}
                    </dt>
                    <dd>{{ state.serverRecord.value[key] || '—' }}</dd></template
                  >
                </dl>
                <a-button @click="state.select(state.serverRecord.value)">{{
                  t('proto.specUseServer')
                }}</a-button>
              </div>
              <div class="spec-field">
                <label for="spec-title"
                  >{{ t('proto.specTitle') }} <span aria-hidden="true">*</span></label
                ><input
                  id="spec-title"
                  v-model="state.form.title"
                  name="objectName"
                  autocomplete="off"
                  maxlength="120"
                  required
                  :readonly="!state.canEdit.value"
                  :disabled="state.locked.value || state.conflict.value"
                  :aria-invalid="!!state.invalid.title"
                  :aria-describedby="state.invalid.title ? 'spec-title-error' : undefined"
                /><span v-if="state.invalid.title" id="spec-title-error" class="spec-field-error">{{
                  state.invalid.title
                }}</span>
              </div>
              <div class="spec-field">
                <label for="spec-purpose">{{ t('proto.specPurpose') }}</label
                ><textarea
                  id="spec-purpose"
                  v-model="state.form.purpose"
                  name="purpose"
                  autocomplete="off"
                  rows="3"
                  maxlength="2000"
                  :readonly="!state.canEdit.value"
                  :disabled="state.locked.value || state.conflict.value"
                />
              </div>
              <fieldset class="spec-area">
                <legend id="spec-area" tabindex="-1">{{ t('proto.specArea') }}</legend>
                <p v-if="!state.form.anchor" class="spec-area-empty">{{ t('proto.specNoArea') }}</p>
                <p v-else class="spec-geometry" translate="no">
                  {{ state.form.anchor.shape }} · {{ state.form.anchor.x }},
                  {{ state.form.anchor.y }} · {{ state.form.anchor.width }} ×
                  {{ state.form.anchor.height }}
                </p>
                <div class="spec-area-actions">
                  <a-button
                    v-if="state.form.anchor"
                    :disabled="mismatch || state.locked.value"
                    @click="locate"
                    ><aim-outlined aria-hidden="true" />{{ t('proto.specLocate') }}</a-button
                  ><template v-if="state.canEdit.value"
                    ><a-button
                      v-for="shape in ['point', 'rect', 'ellipse'] as const"
                      :key="shape"
                      :disabled="editorDisabled || mismatch"
                      @click="capture(shape)"
                      >{{
                        t(
                          `proto.${shape === 'point' ? 'specPoint' : shape === 'rect' ? 'specRect' : 'specEllipse'}`,
                        )
                      }}</a-button
                    ><a-button
                      v-if="state.form.anchor"
                      :disabled="editorDisabled"
                      @click="removeArea"
                      >{{ t('proto.specRemoveArea') }}</a-button
                    ></template
                  >
                </div>
                <p v-if="geometryNotice" role="status">{{ geometryNotice }}</p>
              </fieldset>
              <div v-for="key in secondaryFields" :key="key" class="spec-field">
                <label :for="`spec-${key}`">{{ t(`proto.${fieldKeys[key]}`) }}</label
                ><textarea
                  :id="`spec-${key}`"
                  v-model="state.form[key]"
                  :name="key"
                  autocomplete="off"
                  :rows="key === 'notes' ? 4 : 2"
                  :maxlength="key === 'notes' ? 4000 : 2000"
                  :readonly="!state.canEdit.value"
                  :disabled="state.locked.value || state.conflict.value"
                  :aria-invalid="!!state.invalid[key]"
                /><span v-if="state.invalid[key]" class="spec-field-error">{{
                  state.invalid[key]
                }}</span>
              </div>
            </div>
            <footer class="spec-editor-actions">
              <a-button
                v-if="state.canEdit.value"
                type="primary"
                html-type="submit"
                :loading="state.busy.value"
                :disabled="state.locked.value || state.conflict.value"
                >{{ t('proto.specSave') }}</a-button
              ><a-button
                v-if="state.canEdit.value && state.original.value"
                danger
                :disabled="state.locked.value || state.conflict.value || state.dirty.value"
                @click="remove"
                >{{ t('proto.specDelete') }}</a-button
              >
            </footer>
          </form>
        </section>
      </div>
    </div>
    <modal-context-holder />
  </aside>
</template>
<style scoped>
.functional-sidebar {
  width: 620px;
  max-width: 48vw;
  flex: none;
  min-height: 0;
  height: 100dvh;
  background: var(--color-surface);
  color: var(--color-text);
  border-left: 1px solid var(--color-border);
  position: relative;
}
.spec-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.spec-header {
  padding: 18px 20px 16px;
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--color-border);
}
.spec-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px;
  text-wrap: balance;
}
.spec-header p {
  color: var(--color-muted);
  margin: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.spec-header > div {
  min-width: 0;
}
.spec-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
}
.spec-catalog,
.spec-detail {
  padding: 20px 16px;
  overflow: auto;
  min-width: 0;
  overscroll-behavior: contain;
  scrollbar-color: var(--color-border) transparent;
}
.spec-catalog {
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.spec-new,
.spec-kept-draft {
  margin-bottom: 16px;
}
.spec-search {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.spec-search > input {
  flex: 1 1 100%;
}
.spec-search > button {
  margin-left: auto;
}
.spec-count,
.spec-scope,
.spec-area-empty {
  font-size: 13px;
  color: var(--color-muted);
}
.spec-count {
  margin: 16px 0 8px;
  font-variant-numeric: tabular-nums;
}
.spec-list {
  padding: 0;
  margin: 0 0 20px;
  list-style: none;
}
.spec-record {
  padding: 12px 10px;
  width: 100%;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  min-height: 52px;
}
.spec-record strong {
  font-weight: 500;
  display: block;
  overflow-wrap: anywhere;
}
.spec-record span {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--color-muted);
  font-size: 12px;
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.spec-record:hover,
.spec-record[aria-pressed='true'] {
  background: var(--color-background);
}
.spec-record[aria-pressed='true'] strong {
  color: var(--color-primary);
}
.spec-select {
  padding: 0 16px;
}
.spec-empty,
.spec-select {
  margin: 20px 0;
  line-height: 1.6;
  color: var(--color-muted);
}
.spec-scope {
  margin-top: auto;
  padding-top: 24px;
}
.spec-scope summary {
  cursor: pointer;
}
.spec-scope p {
  margin: 8px 0 0;
  line-height: 1.6;
}
.spec-editor-heading {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 24px;
}
.spec-editor-heading h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  overflow-wrap: anywhere;
}
.spec-editor-heading span {
  font-size: 12px;
  color: var(--color-muted);
  white-space: nowrap;
}
.spec-field {
  margin-bottom: 20px;
}
.spec-field label {
  display: block;
  font-weight: 500;
  margin-bottom: 6px;
}
.functional-sidebar input,
.functional-sidebar textarea {
  display: block;
  font: inherit;
  line-height: 1.5;
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  caret-color: var(--color-primary);
}
.functional-sidebar textarea {
  resize: vertical;
  min-height: 66px;
}
.functional-sidebar input::placeholder {
  color: var(--color-muted);
}
.functional-sidebar [readonly] {
  background: var(--color-background);
}
.functional-sidebar :is(input, textarea, button, summary):focus-visible,
#spec-area:focus-visible,
#spec-notice:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.functional-sidebar :disabled {
  cursor: not-allowed;
}
.spec-field-error {
  color: var(--color-danger, #b42318);
  font-size: 12px;
  display: block;
  margin-top: 4px;
}
.spec-field label > span {
  color: var(--color-danger, #b42318);
}
.spec-area {
  border: 0;
  padding: 0;
  margin: 4px 0 24px;
  min-width: 0;
}
.spec-area legend {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}
.spec-area p {
  font-size: 12px;
  line-height: 1.5;
  margin: 8px 0;
}
.spec-area-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.spec-area-actions > button {
  font-size: 12px;
}
.spec-geometry {
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  color: var(--color-muted);
}
.spec-detail {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.spec-detail > form {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.spec-editor-fields {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 20px 16px 0;
  scrollbar-color: var(--color-border) transparent;
}
.spec-editor-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  flex: none;
  flex-wrap: wrap;
}
.spec-alert {
  margin: 12px 16px 0;
  flex: none;
}
.spec-alert :deep(.ant-alert-action) {
  margin-left: 0;
  margin-top: 8px;
  width: 100%;
}
.spec-alert {
  flex-wrap: wrap;
}
.spec-notice {
  margin: 12px 16px 0;
  color: var(--color-success, #20713e);
}
.spec-server {
  padding: 12px;
  background: var(--color-background);
  margin-bottom: 24px;
}
.spec-server h4 {
  margin: 0 0 12px;
  font-size: 14px;
}
.spec-server dl {
  margin: 0 0 16px;
}
.spec-server dt {
  font-size: 12px;
  color: var(--color-muted);
  margin-top: 12px;
}
.spec-server dd {
  margin: 4px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.spec-scope-change {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}
.spec-scope-change p {
  margin: 0 0 8px;
}
.spec-back {
  display: none;
}
.spec-return-strip {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.spec-return-strip span {
  line-height: 1.6;
}
.spec-drawing .spec-panel,
.spec-locating .spec-panel {
  visibility: hidden;
}
.functional-sidebar ::selection {
  background: var(--color-primary-soft, #d6e9ff);
  color: var(--color-text);
}
@media (max-width: 1100px) {
  .functional-sidebar {
    max-width: none;
    width: min(620px, 100vw);
    position: fixed;
    inset: 0 0 0 auto;
    z-index: 900;
    box-shadow: -8px 0 24px rgb(16 24 40 / 12%);
  }
  .spec-drawing,
  .spec-locating {
    width: 0;
    overflow: visible;
    box-shadow: none;
    border: 0;
  }
  .spec-return-strip {
    position: fixed;
    top: auto;
    bottom: 12px;
    left: 12px;
    right: 12px;
    padding: 12px;
    background: var(--color-surface);
    box-shadow: 0 4px 20px rgb(16 24 40 / 16%);
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    border-radius: var(--radius);
  }
  .spec-return-strip span {
    font-size: 12px;
  }
}
@media (max-width: 640px) {
  .spec-header {
    padding: 16px;
  }
  .spec-header h2 {
    font-size: 17px;
  }
  .spec-body {
    display: block;
  }
  .spec-catalog,
  .spec-detail {
    height: 100%;
    padding: 16px;
  }
  .spec-catalog {
    border: 0;
  }
  .spec-detail {
    display: none;
  }
  .spec-mobile-editor .spec-detail {
    display: flex;
    padding: 0;
  }
  .spec-mobile-editor .spec-catalog {
    display: none;
  }
  .spec-back {
    display: inline-flex;
    padding: 12px 16px;
    margin: 0;
    align-self: flex-start;
    flex: none;
  }
  .spec-search {
    flex-wrap: nowrap;
  }
  .spec-search > input {
    flex-basis: auto;
  }
  .functional-sidebar :is(button, input) {
    min-height: 44px;
  }
  .spec-area-actions > button {
    font-size: 13px;
  }
}
</style>
