<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import {
  Alert as AAlert,
  Button as AButton,
  Modal,
  Pagination as APagination,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { ReviewContext } from '../types'
import type { StudyScope } from '../types/usability-study'
import { useUsabilityStudies } from '../hooks/useUsabilityStudies'
import UsabilityStudyEditor from './UsabilityStudyEditor.vue'
import UsabilityStudyParticipation from './UsabilityStudyParticipation.vue'
import UsabilityStudyResults from './UsabilityStudyResults.vue'
const props = defineProps<{ scope: StudyScope; identity?: ReviewContext; suspended?: boolean }>()
const emit = defineEmits<{ close: []; authenticate: [] }>()
const { t } = useI18n()
const state = useUsabilityStudies(toRef(props, 'scope'), toRef(props, 'identity'))
const root = ref<HTMLElement>(),
  heading = ref<HTMLElement>(),
  section = ref<'basics' | 'tasks' | 'questions'>('basics')
const editor = ref<{ focusInvalid: () => Promise<void> }>(),
  participant = ref<{ focusInvalid: () => Promise<void> }>()
const [modal, ModalContextHolder] = Modal.useModal()
const title = computed(() => state.original.value?.title || t('proto.studies'))
const showPreview = computed(
  () => state.mode.value === 'preview' || state.mode.value === 'participate',
)
async function focusHeading() {
  await nextTick()
  heading.value?.focus()
}
function confirm(title: string, content: string, okText: string) {
  return new Promise<boolean>((resolve) =>
    modal.confirm({
      zIndex: 1400,
      title,
      content,
      okText,
      cancelText: t('proto.studyCancel'),
      autoFocusButton: 'cancel',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  )
}
async function canLeave() {
  if (state.locked.value) {
    state.error.value = t('proto.studyBusy')
    return false
  }
  return (
    !state.dirty.value ||
    (await confirm(
      t('proto.studyDiscardTitle'),
      t('proto.studyDiscardHint'),
      t('proto.studyDiscard'),
    ))
  )
}
async function close() {
  if (await canLeave()) emit('close')
}
async function list() {
  if (!(await canLeave())) return
  state.mode.value = 'list'
  await state.load()
  await focusHeading()
}
async function create() {
  if (!(await canLeave())) return
  state.create()
  section.value = 'basics'
  await nextTick()
  root.value?.querySelector<HTMLElement>('#study-title')?.focus()
}
async function open(id: string) {
  if (!(await canLeave())) return
  await state.open(id)
  section.value = 'basics'
  await focusHeading()
}
async function save() {
  await state.save()
  await nextTick()
  if (state.invalid.value) {
    section.value =
      !state.form.title.trim() || !state.form.consentText.trim()
        ? 'basics'
        : state.form.tasks.some((task) => !task.title.trim() || !task.steps.length)
          ? 'tasks'
          : 'questions'
    await nextTick()
    await editor.value?.focusInvalid()
  } else await focusHeading()
}
async function action(kind: 'open' | 'close' | 'delete') {
  const key = kind === 'open' ? 'Open' : kind === 'close' ? 'Stop' : 'Delete'
  if (
    !(await confirm(
      t(`proto.study${key}Title`),
      t(`proto.study${key}Hint`),
      t(`proto.study${key}`),
    ))
  )
    return
  await state.action(kind)
  await focusHeading()
}
async function participate(kind: 'consent' | 'progress' | 'submit' | 'withdraw') {
  if (
    kind === 'submit' &&
    !(await confirm(
      t('proto.studySubmitTitle'),
      t('proto.studySubmitHint'),
      t('proto.studySubmit'),
    ))
  )
    return
  if (
    kind === 'withdraw' &&
    !(await confirm(
      t('proto.studyWithdrawTitle'),
      t('proto.studyWithdrawHint'),
      t('proto.studyWithdraw'),
    ))
  )
    return
  await state.participate(kind)
  await nextTick()
  if (state.invalid.value) await participant.value?.focusInvalid()
  else root.value?.querySelector<HTMLElement>('[data-study-status]')?.focus()
}
async function preview() {
  state.mode.value = 'preview'
  await focusHeading()
}
async function edit() {
  state.mode.value = 'edit'
  await focusHeading()
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void close()
    return
  }
  if (event.key !== 'Tab' || !root.value) return
  const items = [
    ...root.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, iframe, [tabindex="0"]',
    ),
  ].filter((item) => item.offsetParent !== null)
  const first = items[0],
    last = items[items.length - 1]
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
function beforeUnload(event: BeforeUnloadEvent) {
  if (state.dirty.value || state.locked.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onBeforeRouteLeave(canLeave)
onBeforeRouteUpdate((to, from) =>
  to.path === from.path && to.query.revisionId === from.query.revisionId ? true : canLeave(),
)
let background: HTMLElement[] = []
onMounted(() => {
  background = [...document.body.children].filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && !element.contains(root.value || null) && !element.inert,
  )
  background.forEach((element) => {
    element.inert = true
  })
  window.addEventListener('beforeunload', beforeUnload)
  void focusHeading()
})
onBeforeUnmount(() => {
  background.forEach((element) => {
    element.inert = false
  })
  window.removeEventListener('beforeunload', beforeUnload)
})
defineExpose({ canLeave, focusHeading })
</script>
<template>
  <teleport to="body"
    ><div
      class="study-overlay"
      :inert="suspended || undefined"
      :aria-hidden="suspended || undefined"
    >
      <section
        ref="root"
        class="study-workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-heading"
        :aria-busy="state.loading.value || state.busy.value"
        @keydown="keydown"
      >
        <header class="study-header">
          <div>
            <h1 id="study-heading" ref="heading" tabindex="-1">{{ title }}</h1>
            <p>
              {{ scope.context.title }} · {{ scope.context.versionName
              }}<span v-if="state.original.value">
                · {{ t(`proto.studyState_${state.original.value.state}`) }}</span
              >
            </p>
          </div>
          <a-button :disabled="state.locked.value" @click="close">{{
            t('proto.studyClose')
          }}</a-button>
        </header>
        <div
          v-if="state.error.value || state.notice.value || state.invalid.value"
          data-study-status
          class="study-status"
          tabindex="-1"
          aria-live="polite"
        >
          <a-alert
            v-if="state.error.value"
            type="error"
            show-icon
            :message="state.error.value"
          /><a-alert
            v-if="state.invalid.value"
            type="error"
            show-icon
            :message="t(state.isPublic.value ? 'proto.studyAnswerInvalid' : 'proto.studyInvalid')"
          />
          <p v-if="state.notice.value" role="status">{{ state.notice.value }}</p>
          <div class="study-actions">
            <a-button v-if="state.unknown.value" :loading="state.busy.value" @click="state.retry">{{
              t('proto.studyRetry')
            }}</a-button
            ><a-button
              v-if="state.conflict.value && state.original.value"
              :disabled="state.locked.value"
              @click="state.open(state.original.value!.id, true)"
              >{{ t('proto.studyRefreshVersion') }}</a-button
            >
          </div>
        </div>
        <div class="study-body">
          <template v-if="state.mode.value === 'list'">
            <div class="study-toolbar">
              <h2>{{ t('proto.studies') }}</h2>
              <div class="study-actions">
                <a-button
                  :disabled="state.loading.value || state.locked.value"
                  @click="state.load()"
                  >{{ t('proto.studyRefresh') }}</a-button
                ><a-button
                  v-if="state.canEdit.value"
                  type="primary"
                  :disabled="state.locked.value || state.total.value >= 10"
                  @click="create"
                  >{{ t('proto.studyNew') }}</a-button
                >
              </div>
            </div>
            <div
              v-if="!state.rows.value.length && !state.loading.value && !state.error.value"
              class="study-empty"
            >
              <h3>{{ t(state.isPublic.value ? 'proto.studyPublicEmpty' : 'proto.studyEmpty') }}</h3>
              <p v-if="state.canEdit.value">{{ t('proto.studyEmptyHint') }}</p>
            </div>
            <ul class="study-records">
              <li v-for="row in state.rows.value" :key="row.id">
                <button
                  class="study-record"
                  :disabled="state.loading.value || state.locked.value"
                  @click="open(row.id)"
                >
                  <strong>{{ row.title }}</strong
                  ><span>{{ t(`proto.studyState_${row.state}`) }}</span>
                </button>
              </li>
            </ul>
            <a-pagination
              v-if="state.total.value > 20"
              :current="state.pageIndex.value + 1"
              :page-size="20"
              :total="state.total.value"
              :show-size-changer="false"
              :disabled="state.loading.value || state.locked.value"
              @change="state.load($event - 1)"
            />
          </template>
          <template v-else-if="!state.denied.value">
            <nav v-if="!state.isPublic.value" class="study-tabs" :aria-label="t('proto.studies')">
              <template v-if="state.mode.value === 'edit'"
                ><a-button
                  v-for="item in ['basics', 'tasks', 'questions'] as const"
                  :key="item"
                  :type="section === item ? 'primary' : 'default'"
                  :aria-pressed="section === item"
                  @click="section = item"
                  >{{
                    t(
                      item === 'basics'
                        ? 'proto.studyDefinition'
                        : item === 'tasks'
                          ? 'proto.studyTasks'
                          : 'proto.studyQuestions',
                    )
                  }}</a-button
                ></template
              ><a-button
                v-if="state.editable.value && state.mode.value !== 'edit'"
                :disabled="state.locked.value"
                @click="edit"
                >{{ t('proto.studyEdit') }}</a-button
              ><a-button
                :disabled="state.locked.value || !state.form.tasks.length"
                :type="state.mode.value === 'preview' ? 'primary' : 'default'"
                @click="preview"
                >{{ t('proto.studyPreview') }}</a-button
              ><a-button
                v-if="state.original.value"
                :disabled="state.locked.value || state.dirty.value || state.loading.value"
                :type="state.mode.value === 'results' ? 'primary' : 'default'"
                @click="state.results()"
                >{{ t('proto.studyResults') }}</a-button
              >
            </nav>
            <usability-study-editor
              v-if="state.mode.value === 'edit'"
              ref="editor"
              :form="state.form"
              :invalid="state.invalid.value"
              :section="section"
              :pages="state.pages.value"
              :disabled="state.locked.value || !state.editable.value"
              :scripts="state.scripts.value"
              :script-total="state.scriptTotal.value"
              :script-page="state.scriptPage.value"
              :loading="state.loading.value"
              @scripts="state.loadScripts"
              @copy="state.copyScript"
            />
            <template v-else-if="showPreview"
              ><p v-if="!state.isPublic.value && state.dirty.value" class="muted">
                {{ t('proto.studyUnsavedPreview') }}
              </p>
              <usability-study-participation
                ref="participant"
                :key="`${state.original.value?.id || 'new'}-${state.isPublic.value ? 'public' : 'member'}`"
                :study="{ ...state.form, state: state.original.value?.state }"
                :answers="state.answers"
                :invalid="state.invalid.value"
                :own="state.own.value"
                :identified="state.identified.value"
                :locked="state.locked.value"
                :context="scope.context"
                :preview="!state.isPublic.value"
                @action="participate"
                @authenticate="emit('authenticate')"
            /></template>
            <usability-study-results
              v-else-if="state.mode.value === 'results' && state.aggregate.value"
              :definition="state.form"
              :aggregate="state.aggregate.value"
              :responses="state.responses.value"
              :total="state.responseTotal.value"
              :page-index="state.responsePage.value"
              :loading="state.loading.value"
              @page="state.results"
              @export="state.exportCsv"
            />
          </template>
        </div>
        <footer v-if="state.mode.value !== 'list' && !state.denied.value" class="study-footer">
          <a-button :disabled="state.locked.value" @click="list">{{
            t('proto.studyBack')
          }}</a-button>
          <div v-if="!state.isPublic.value" class="study-actions">
            <a-button
              v-if="state.original.value && state.canEdit.value"
              danger
              :disabled="state.locked.value || state.conflict.value"
              @click="action('delete')"
              >{{ t('proto.studyDelete') }}</a-button
            ><a-button
              v-if="state.original.value?.state === 'open' && state.canEdit.value"
              :disabled="state.locked.value || state.conflict.value"
              @click="action('close')"
              >{{ t('proto.studyStop') }}</a-button
            ><a-button
              v-if="
                state.original.value?.state === 'draft' && state.canEdit.value && !state.dirty.value
              "
              :type="state.mode.value === 'preview' ? 'primary' : 'default'"
              :disabled="state.locked.value || state.conflict.value || !state.form.tasks.length"
              @click="action('open')"
              >{{ t('proto.studyOpen') }}</a-button
            ><a-button
              v-if="state.editable.value && state.mode.value === 'edit'"
              type="primary"
              :loading="state.busy.value"
              :disabled="state.unknown.value || state.conflict.value || state.loading.value"
              @click="save"
              >{{ t('proto.studySave') }}</a-button
            >
          </div>
        </footer>
        <modal-context-holder />
      </section></div
  ></teleport>
</template>
<style scoped>
.study-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(15 23 42 / 42%);
}
.study-workspace {
  display: flex;
  flex-direction: column;
  width: min(1280px, 100%);
  height: min(920px, 100%);
  min-width: 0;
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: var(--radius);
  box-shadow: 0 18px 60px rgb(15 23 42 / 24%);
  overflow: hidden;
}
.study-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--color-border);
}
.study-header > div {
  min-width: 0;
}
.study-header h1 {
  margin: 0;
  font-size: 22px;
  overflow-wrap: anywhere;
}
.study-header p {
  margin: 4px 0 0;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}
.study-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 24px;
}
.study-status {
  padding: 12px 24px 0;
}
.study-status > p {
  margin: 8px 0;
}
.study-footer {
  padding: 14px 24px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.study-workspace :deep(.study-toolbar),
.study-workspace :deep(.study-actions),
.study-workspace :deep(.study-tabs),
.study-workspace :deep(.study-item-heading),
.study-workspace :deep(.study-source-row),
.study-workspace :deep(.study-option-field),
.study-workspace :deep(.study-flow-actions) {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.study-workspace :deep(.study-toolbar),
.study-workspace :deep(.study-item-heading),
.study-workspace :deep(.study-source-row) {
  justify-content: space-between;
}
.study-workspace :deep(.study-toolbar),
.study-workspace :deep(.study-tabs) {
  margin-bottom: 20px;
}
.study-workspace :deep(h2) {
  font-size: 20px;
  margin: 0 0 12px;
  overflow-wrap: anywhere;
}
.study-workspace :deep(h2 span) {
  color: var(--color-muted);
  font-size: 14px;
  font-weight: 400;
  margin-left: 6px;
}
.study-workspace :deep(h3) {
  font-size: 16px;
  margin: 24px 0 8px;
  overflow-wrap: anywhere;
}
.study-workspace :deep(.study-toolbar h2),
.study-workspace :deep(.study-item-heading h3) {
  margin: 0;
}
.study-workspace :deep(label) {
  display: block;
  margin: 18px 0 6px;
  font-weight: 600;
}
.study-workspace :deep(input:not([type='checkbox'])),
.study-workspace :deep(textarea),
.study-workspace :deep(select) {
  width: 100%;
  min-width: 0;
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 9px 11px;
}
.study-workspace :deep(textarea) {
  resize: vertical;
  line-height: 1.6;
}
.study-workspace :deep(input:disabled),
.study-workspace :deep(textarea:disabled),
.study-workspace :deep(select:disabled) {
  background: var(--color-bg);
  color: var(--color-muted);
}
.study-workspace :deep(.study-fields) {
  max-width: 760px;
}
.study-workspace :deep(.study-check) {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  line-height: 1.6;
  font-weight: 400;
}
.study-workspace :deep(input[type='checkbox']) {
  margin-top: 5px;
  accent-color: var(--color-primary);
}
.study-workspace :deep(.study-consent-check) {
  margin: 24px 0 16px;
  max-width: 72ch;
}
.study-workspace :deep(.study-text) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-width: 72ch;
  line-height: 1.7;
}
.study-workspace :deep(.study-introduction) {
  margin-bottom: 28px;
}
.study-workspace :deep(.study-field-error) {
  color: var(--color-danger, #b42318);
  margin: 6px 0;
  font-size: 13px;
}
.study-workspace :deep(.muted) {
  color: var(--color-muted);
}
.study-workspace :deep(.study-empty) {
  padding: 44px 12px;
  color: var(--color-muted);
  text-align: center;
}
.study-workspace :deep(.study-empty h3) {
  margin-top: 0;
}
.study-workspace :deep(.study-records) {
  list-style: none;
  margin: 0;
  padding: 0;
}
.study-workspace :deep(.study-record) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  padding: 20px 12px;
  text-align: left;
  cursor: pointer;
  color: inherit;
  gap: 20px;
  font: inherit;
}
.study-workspace :deep(.study-record:hover),
.study-workspace :deep(.study-disclosure:hover) {
  background: var(--color-bg);
}
.study-workspace :deep(.study-record strong) {
  overflow-wrap: anywhere;
}
.study-workspace :deep(.study-record span) {
  font-size: 13px;
  color: var(--color-muted);
  flex-shrink: 0;
}
.study-workspace :deep(.study-edit-item),
.study-workspace :deep(.study-aggregate-item) {
  border-top: 1px solid var(--color-border);
  padding: 20px 0;
}
.study-workspace :deep(.study-edit-item .study-actions .ant-btn) {
  font-size: 12px;
}
.study-workspace :deep(.study-disclosure) {
  text-align: left;
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 10px 4px;
  overflow-wrap: anywhere;
}
.study-workspace :deep(.study-task-fields) {
  max-width: 860px;
  padding: 4px 0 12px;
}
.study-workspace :deep(.study-step) {
  padding: 20px 0;
  border-top: 1px solid var(--color-border);
}
.study-workspace :deep(.study-source) {
  background: var(--color-bg);
  padding: 0 16px 16px;
  margin-bottom: 20px;
}
.study-workspace :deep(.study-source-row) {
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
}
.study-workspace :deep(.study-option) {
  margin-bottom: 12px;
}
.study-workspace :deep(.study-option-field) {
  flex-wrap: nowrap;
}
.study-workspace :deep(details) {
  margin: 16px 0;
}
.study-workspace :deep(summary) {
  cursor: pointer;
  color: var(--color-muted);
}
.study-workspace :deep(.study-task-layout) {
  display: grid;
  grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);
  gap: 24px;
}
.study-workspace :deep(.study-task-instructions) {
  min-width: 0;
}
.study-workspace :deep(.study-position) {
  margin: 0 0 10px;
  font-variant-numeric: tabular-nums;
}
.study-workspace :deep(.study-flow-actions) {
  margin-top: 28px;
  justify-content: flex-end;
}
.study-workspace :deep(.study-question-field) {
  max-width: 760px;
  margin: 24px 0;
}
.study-workspace :deep(.study-required) {
  font-size: 12px;
  font-weight: 400;
  margin-left: 8px;
  color: var(--color-muted);
}
.study-workspace :deep(.study-answer-list) {
  max-width: 860px;
}
.study-workspace :deep(.study-answer-list dt) {
  font-weight: 600;
  margin-top: 20px;
  overflow-wrap: anywhere;
}
.study-workspace :deep(.study-answer-list dd) {
  margin: 6px 0 0;
}
.study-workspace :deep(.study-counts) {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 12px 0 0;
  gap: 16px;
}
.study-workspace :deep(.study-counts dt) {
  color: var(--color-muted);
}
.study-workspace :deep(.study-counts dd) {
  font-weight: 600;
  margin: 6px 0 0;
  font-variant-numeric: tabular-nums;
}
.study-workspace :deep(.study-distribution > div) {
  display: flex;
  gap: 24px;
  justify-content: space-between;
  max-width: 760px;
  border-bottom: 1px solid var(--color-border);
  padding: 10px 0;
}
.study-workspace :deep(.study-distribution dt) {
  overflow-wrap: anywhere;
}
.study-workspace :deep(.study-distribution dd) {
  flex-shrink: 0;
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.study-workspace :deep(button:focus-visible),
.study-workspace :deep(input:focus-visible),
.study-workspace :deep(textarea:focus-visible),
.study-workspace :deep(select:focus-visible),
.study-workspace :deep(summary:focus-visible) {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
.study-workspace :deep(::selection) {
  color: #fff;
  background: var(--color-primary);
}
.study-workspace :deep(input),
.study-workspace :deep(textarea) {
  caret-color: var(--color-primary);
}
@media (max-width: 700px) {
  .study-overlay {
    padding: 0;
  }
  .study-workspace {
    width: 100%;
    height: 100dvh;
    border-radius: 0;
  }
  .study-header {
    padding: 12px 16px;
    gap: 12px;
    align-items: flex-start;
  }
  .study-header h1 {
    font-size: 20px;
  }
  .study-header > .ant-btn {
    max-width: 120px;
  }
  .study-body {
    padding: 20px 16px;
  }
  .study-status {
    padding: 8px 16px 0;
  }
  .study-footer {
    padding: 10px 16px max(10px, env(safe-area-inset-bottom));
    flex-direction: column;
  }
  .study-workspace :deep(.ant-btn) {
    min-height: 44px;
    height: auto;
    white-space: normal;
  }
  .study-workspace :deep(.study-actions) {
    align-items: stretch;
  }
  .study-footer .study-actions > .ant-btn {
    flex: 1;
  }
  .study-workspace :deep(.study-tabs) {
    gap: 6px;
  }
  .study-workspace :deep(.study-tabs .ant-btn) {
    flex: 1;
  }
  .study-workspace :deep(.study-task-layout) {
    display: block;
  }
  .study-workspace :deep(.demo-player) {
    margin-top: 24px;
  }
  .study-workspace :deep(.study-item-heading) {
    align-items: flex-start;
  }
  .study-workspace :deep(.study-disclosure) {
    flex-basis: 100%;
  }
  .study-workspace :deep(.study-counts) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .study-workspace :deep(.study-record) {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .study-workspace :deep(input:not([type='checkbox'])),
  .study-workspace :deep(select) {
    min-height: 44px;
  }
  .study-workspace :deep(.study-flow-actions .ant-btn) {
    flex: 1;
  }
}
</style>
