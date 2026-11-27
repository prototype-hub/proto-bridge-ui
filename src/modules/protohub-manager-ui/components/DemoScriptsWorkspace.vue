<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import {
  Alert as AAlert,
  Button as AButton,
  Modal,
  Pagination as APagination,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { copyText } from '@/shared/utils/feedback'
import { useDemoScripts } from '../hooks/useDemoScripts'
import { demoQuery } from '../utils/demo-script'
import type { DemoScriptScope, DemoScriptTarget } from '../types/demo-script'
import DemoScriptPlayer from './DemoScriptPlayer.vue'

const props = defineProps<{ scope: DemoScriptScope; initialTarget?: DemoScriptTarget }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n(),
  route = useRoute(),
  router = useRouter()
const state = useDemoScripts(toRef(props, 'scope'))
const root = ref<HTMLElement>(),
  heading = ref<HTMLElement>()
const [modal, ModalContextHolder] = Modal.useModal()
const stepIndex = computed(() =>
  state.form.steps.findIndex((step) => step.id === state.activeStepId.value),
)
let openedTarget = false
watch(
  () => props.initialTarget,
  () => {
    openedTarget = false
  },
  { flush: 'sync' },
)
watch(
  [state.authorized, state.loading, () => props.initialTarget],
  async () => {
    if (openedTarget || !state.authorized.value || state.loading.value) return
    openedTarget = true
    const target = props.initialTarget
    if (!target) return
    if (target.revisionId !== props.scope.context.revisionId) {
      state.error.value = t('proto.demoUnavailable')
      return
    }
    if (target.scriptId && target.stepId) {
      await state.open(target.scriptId, target.stepId)
      await focusHeading()
    }
  },
  { immediate: true },
)
async function focusHeading() {
  await nextTick()
  heading.value?.focus()
}
function confirm(title: string, content: string, okText: string): Promise<boolean> {
  return new Promise((resolve) =>
    modal.confirm({
      zIndex: 1300,
      title,
      content,
      okText,
      cancelText: t('proto.demoKeep'),
      autoFocusButton: 'cancel',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  )
}
async function canLeave() {
  if (state.locked.value) {
    state.error.value = t('proto.demoBusy')
    return false
  }
  return (
    !state.dirty.value ||
    (await confirm(t('proto.demoDiscardTitle'), t('proto.demoDiscardHint'), t('proto.demoDiscard')))
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
  await nextTick()
  root.value?.querySelector<HTMLElement>('#demo-title')?.focus()
}
async function open(id: string) {
  if (!(await canLeave())) return
  await state.open(id)
  await focusHeading()
}
async function save() {
  await state.save()
  await nextTick()
  if (state.invalid.value) {
    const selector = !state.form.title.trim()
      ? '#demo-title'
      : !state.form.objective.trim()
        ? '#demo-objective'
        : !state.form.steps.length
          ? '[data-demo-add]'
          : '[data-demo-invalid]'
    root.value?.querySelector<HTMLElement>(selector)?.focus()
  } else root.value?.querySelector<HTMLElement>('[data-demo-status]')?.focus()
}
async function remove() {
  if (
    !state.original.value ||
    !(await confirm(
      t('proto.demoDeleteTitle'),
      t('proto.demoDeleteHint', { title: state.original.value.title }),
      t('proto.demoDelete'),
    ))
  )
    return
  await state.remove()
  await focusHeading()
}
async function rehearse() {
  if (!state.form.steps.length || state.locked.value) return
  if (!state.activeStep.value) state.activeStepId.value = state.form.steps[0].id
  state.mode.value = 'rehearse'
  await focusHeading()
}
async function edit() {
  state.mode.value = 'edit'
  await focusHeading()
}
async function move(id: string, offset: number) {
  state.moveStep(id, offset)
  await nextTick()
  const row = root.value?.querySelector<HTMLElement>(`[data-demo-step="${id}"]`)
  ;(
    row?.querySelector<HTMLElement>(`[data-demo-${offset < 0 ? 'up' : 'down'}]:not(:disabled)`) ||
    row?.querySelector('select')
  )?.focus()
}
async function removeStep(id: string) {
  state.removeStep(id)
  await nextTick()
  const target = root.value?.querySelector<HTMLElement>(
    `[data-demo-step="${state.activeStepId.value}"] select`,
  )
  ;(target || root.value?.querySelector<HTMLElement>('[data-demo-add]'))?.focus()
}
async function addStep() {
  state.addStep()
  await nextTick()
  root.value
    ?.querySelector<HTMLElement>(`[data-demo-step="${state.activeStepId.value}"] select`)
    ?.focus()
}
function jump(id: string) {
  if (state.locked.value || !state.form.steps.some((step) => step.id === id)) return
  state.activeStepId.value = id
}
function advance(offset: number) {
  const step = state.form.steps[stepIndex.value + offset]
  if (step) jump(step.id)
}
async function copy() {
  const row = state.original.value,
    step = state.activeStep.value
  if (!row || !step || state.dirty.value || state.locked.value) return
  const target = { revisionId: row.revisionId, scriptId: row.id, stepId: step.id }
  const href = router.resolve({
    path: route.path,
    query: { ...demoQuery(target), pageId: step.pageId },
  }).href
  state.notice.value = t(
    (await copyText(new URL(href, window.location.origin).href))
      ? 'proto.demoCopied'
      : 'proto.demoCopyFailed',
  )
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
onBeforeRouteUpdate(async (to, from) =>
  to.path === from.path &&
  to.query.revisionId === from.query.revisionId &&
  to.query.scriptId === from.query.scriptId &&
  to.query.stepId === from.query.stepId
    ? true
    : canLeave(),
)
let background: HTMLElement[] = []
onMounted(() => {
  // The opaque player cannot forward focus events; keep the underlying app out of its tab order.
  background = [...document.body.children].filter(
    (element) =>
      element instanceof HTMLElement && !element.contains(root.value || null) && !element.inert,
  ) as HTMLElement[]
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
defineExpose({ canLeave })
</script>
<template>
  <teleport to="body">
    <div class="demo-overlay">
      <section
        ref="root"
        class="demo-workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-heading"
        @keydown="keydown"
      >
        <header class="demo-header">
          <div>
            <h1 id="demo-heading" ref="heading" tabindex="-1">{{ t('proto.demoScripts') }}</h1>
            <p>{{ scope.context.title }} · {{ scope.context.versionName }}</p>
          </div>
          <a-button :aria-label="t('proto.demoClose')" @click="close">{{
            t('proto.demoClose')
          }}</a-button>
        </header>
        <div class="demo-status" aria-live="polite">
          <a-alert v-if="state.error.value" type="error" show-icon :message="state.error.value" />
          <p v-if="state.notice.value" data-demo-status tabindex="-1">{{ state.notice.value }}</p>
          <a-alert
            v-if="state.invalid.value"
            data-demo-invalid
            tabindex="-1"
            type="error"
            :message="t('proto.demoInvalid')"
          />
          <div v-if="state.unknown.value || state.conflict.value" class="demo-recovery">
            <a-button v-if="state.unknown.value" :loading="state.busy.value" @click="state.retry">{{
              t('proto.demoRetry')
            }}</a-button>
            <a-button
              v-else-if="state.original.value"
              :loading="state.loading.value"
              @click="state.open(state.original.value.id, undefined, true)"
              >{{ t('proto.demoRefreshVersion') }}</a-button
            >
          </div>
        </div>
        <template v-if="!state.denied.value">
          <div v-if="state.mode.value === 'list'" class="demo-list demo-scroll">
            <div class="demo-toolbar">
              <h2>{{ t('proto.demoList') }}</h2>
              <div>
                <a-button :loading="state.loading.value" @click="state.load()">{{
                  t('proto.demoRefresh')
                }}</a-button>
                <a-button v-if="state.canEdit.value" type="primary" @click="create">{{
                  t('proto.demoNew')
                }}</a-button>
              </div>
            </div>
            <p v-if="state.loading.value" role="status">{{ t('common.loading') }}</p>
            <div v-else-if="!state.rows.value.length" class="demo-empty">
              <h3>{{ t(state.isPublic.value ? 'proto.demoPublicEmpty' : 'proto.demoEmpty') }}</h3>
              <p v-if="state.canEdit.value">{{ t('proto.demoEmptyHint') }}</p>
            </div>
            <ul v-else class="demo-records">
              <li v-for="row in state.rows.value" :key="row.id">
                <button class="demo-record" @click="open(row.id)">
                  <strong>{{ row.title }}</strong>
                  <span v-if="'shareEnabled' in row">{{
                    t(row.shareEnabled ? 'proto.demoShared' : 'proto.demoInternal')
                  }}</span>
                </button>
              </li>
            </ul>
            <a-pagination
              v-if="state.total.value > 20"
              :current="state.pageIndex.value + 1"
              :page-size="20"
              :total="state.total.value"
              :show-size-changer="false"
              @change="(page: number) => state.load(page - 1)"
            />
          </div>
          <template v-else-if="state.mode.value === 'edit'">
            <div class="demo-editor demo-scroll">
              <section class="demo-fields">
                <h2>{{ t('proto.demoEdit') }}</h2>
                <label for="demo-title">{{ t('proto.demoTitle') }}</label
                ><input
                  id="demo-title"
                  v-model="state.form.title"
                  name="demo-title"
                  autocomplete="off"
                  maxlength="120"
                  :disabled="state.locked.value"
                  required
                />
                <label for="demo-objective">{{ t('proto.demoObjective') }}</label
                ><textarea
                  id="demo-objective"
                  v-model="state.form.objective"
                  name="demo-objective"
                  autocomplete="off"
                  rows="3"
                  maxlength="2000"
                  :disabled="state.locked.value"
                  required
                />
                <label for="demo-prerequisites">{{ t('proto.demoPrerequisites') }}</label
                ><textarea
                  id="demo-prerequisites"
                  v-model="state.form.prerequisites"
                  name="demo-prerequisites"
                  autocomplete="off"
                  rows="2"
                  maxlength="2000"
                  :disabled="state.locked.value"
                />
                <label for="demo-reset">{{ t('proto.demoReset') }}</label
                ><textarea
                  id="demo-reset"
                  v-model="state.form.resetNote"
                  name="demo-reset"
                  autocomplete="off"
                  rows="2"
                  maxlength="2000"
                  :disabled="state.locked.value"
                />
                <label class="demo-share"
                  ><input
                    v-model="state.form.shareEnabled"
                    type="checkbox"
                    name="demo-share"
                    :disabled="state.locked.value"
                  />{{ t('proto.demoShare') }}</label
                >
                <details>
                  <summary>{{ t('proto.demoShared') }}</summary>
                  <p>{{ t('proto.demoShareHint') }}</p>
                </details>
              </section>
              <section class="demo-sequence">
                <div class="demo-toolbar">
                  <h2>
                    {{ t('proto.demoSteps') }} <span>{{ state.form.steps.length }} / 50</span>
                  </h2>
                  <a-button
                    data-demo-add
                    :disabled="
                      state.locked.value ||
                      state.form.steps.length >= 50 ||
                      !state.pages.value.length
                    "
                    @click="addStep"
                    >{{ t('proto.demoAddStep') }}</a-button
                  >
                </div>
                <p v-if="!state.form.steps.length" class="demo-empty">
                  {{ t('proto.demoNoSteps') }}
                </p>
                <ol>
                  <li
                    v-for="(step, index) in state.form.steps"
                    :key="step.id"
                    :data-demo-step="step.id"
                  >
                    <div class="demo-step-heading">
                      <h3>{{ t('proto.demoStepLabel', { index: index + 1 }) }}</h3>
                      <div class="demo-step-actions">
                        <a-button
                          data-demo-up
                          :aria-label="t('proto.demoUp', { index: index + 1 })"
                          :disabled="state.locked.value || index === 0"
                          @click="move(step.id, -1)"
                          >{{ t('proto.demoUp', { index: index + 1 }) }}</a-button
                        >
                        <a-button
                          data-demo-down
                          :aria-label="t('proto.demoDown', { index: index + 1 })"
                          :disabled="state.locked.value || index === state.form.steps.length - 1"
                          @click="move(step.id, 1)"
                          >{{ t('proto.demoDown', { index: index + 1 }) }}</a-button
                        >
                        <a-button
                          danger
                          :aria-label="t('proto.demoRemoveStep', { index: index + 1 })"
                          :disabled="state.locked.value"
                          @click="removeStep(step.id)"
                          >{{ t('proto.demoRemoveStep', { index: index + 1 }) }}</a-button
                        >
                      </div>
                    </div>
                    <label :for="`demo-page-${step.id}`">{{ t('proto.demoPage') }}</label
                    ><select
                      :id="`demo-page-${step.id}`"
                      v-model="step.pageId"
                      :name="`demo-page-${step.id}`"
                      :disabled="state.locked.value"
                    >
                      <option
                        v-for="page in state.pages.value"
                        :key="page.pageId"
                        :value="page.pageId"
                      >
                        {{ page.name }} — {{ page.path }}
                      </option>
                    </select>
                    <label :for="`demo-narration-${step.id}`">{{ t('proto.demoNarration') }}</label
                    ><textarea
                      :id="`demo-narration-${step.id}`"
                      v-model="step.narration"
                      :name="`demo-narration-${step.id}`"
                      autocomplete="off"
                      rows="3"
                      maxlength="2000"
                      :disabled="state.locked.value"
                    />
                  </li>
                </ol>
              </section>
            </div>
            <footer class="demo-footer">
              <a-button :disabled="state.locked.value" @click="list">{{
                t('proto.demoList')
              }}</a-button>
              <div>
                <a-button
                  v-if="state.original.value"
                  danger
                  :disabled="state.locked.value || state.conflict.value"
                  @click="remove"
                  >{{ t('proto.demoDelete') }}</a-button
                >
                <a-button
                  :disabled="state.locked.value || !state.form.steps.length"
                  @click="rehearse"
                  >{{ t('proto.demoRehearse') }}</a-button
                >
                <a-button
                  type="primary"
                  :loading="state.busy.value"
                  :disabled="state.unknown.value || state.conflict.value || state.loading.value"
                  @click="save"
                  >{{ t('proto.demoSave') }}</a-button
                >
              </div>
            </footer>
          </template>
          <template v-else>
            <div class="demo-rehearsal demo-scroll">
              <section class="demo-narration">
                <h2>{{ state.form.title }}</h2>
                <p class="demo-text">{{ state.form.objective }}</p>
                <details v-if="state.form.prerequisites || state.form.resetNote">
                  <summary>{{ t('proto.demoBeforeStart') }}</summary>
                  <h3 v-if="state.form.prerequisites">{{ t('proto.demoPrerequisites') }}</h3>
                  <p class="demo-text">{{ state.form.prerequisites }}</p>
                  <h3 v-if="state.form.resetNote">{{ t('proto.demoReset') }}</h3>
                  <p class="demo-text">{{ state.form.resetNote }}</p>
                </details>
                <p v-if="state.dirty.value" class="muted">{{ t('proto.demoUnsavedRehearsal') }}</p>
                <p class="demo-position" aria-live="polite">
                  {{
                    t('proto.demoPosition', {
                      index: stepIndex + 1,
                      count: state.form.steps.length,
                    })
                  }}
                </p>
                <label for="demo-jump">{{ t('proto.demoJump') }}</label
                ><select
                  id="demo-jump"
                  :value="state.activeStepId.value"
                  @change="jump(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="(step, index) in state.form.steps" :key="step.id" :value="step.id">
                    {{ index + 1 }}.
                    {{ state.pages.value.find((page) => page.pageId === step.pageId)?.name }}
                  </option>
                </select>
                <h3>{{ t('proto.demoNarration') }}</h3>
                <p class="demo-text demo-spoken">
                  {{ state.activeStep.value?.narration || t('proto.demoNoNarration') }}
                </p>
              </section>
              <demo-script-player
                v-if="state.activeStep.value"
                :context="scope.context"
                :page-id="state.activeStep.value.pageId"
              />
            </div>
            <footer class="demo-footer">
              <div>
                <a-button @click="list">{{ t('proto.demoList') }}</a-button>
                <a-button v-if="state.canEdit.value" @click="edit">{{
                  t('proto.demoReturnEdit')
                }}</a-button>
                <a-button
                  :disabled="!state.original.value || state.dirty.value || state.locked.value"
                  @click="copy"
                  >{{ t('proto.demoCopy') }}</a-button
                >
              </div>
              <div>
                <a-button :disabled="stepIndex <= 0" @click="advance(-1)">{{
                  t('proto.demoPrevious')
                }}</a-button>
                <a-button
                  type="primary"
                  :disabled="stepIndex >= state.form.steps.length - 1"
                  @click="advance(1)"
                  >{{ t('proto.demoNext') }}</a-button
                >
              </div>
            </footer>
          </template>
        </template>
        <modal-context-holder />
      </section>
    </div>
  </teleport>
</template>
<style scoped>
.demo-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(15 23 42 / 42%);
}
.demo-workspace {
  display: flex;
  flex-direction: column;
  width: min(1280px, 100%);
  height: min(900px, 100%);
  min-width: 0;
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: var(--radius);
  box-shadow: 0 18px 60px rgb(15 23 42 / 24%);
  overflow: hidden;
}
.demo-header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
  padding: 18px 24px;
  border-bottom: 1px solid var(--color-border);
}
.demo-header h1 {
  margin: 0;
  font-size: 22px;
}
.demo-header p {
  margin: 4px 0 0;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}
.demo-header > div {
  min-width: 0;
}
.demo-status:empty {
  display: none;
}
.demo-status {
  padding: 10px 24px;
}
.demo-status p {
  margin: 0;
}
.demo-recovery {
  margin-top: 8px;
}
.demo-scroll {
  overflow: auto;
  overscroll-behavior: contain;
  min-height: 0;
  flex: 1;
}
.demo-list {
  padding: 24px;
}
.demo-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.demo-toolbar > div,
.demo-step-actions,
.demo-footer,
.demo-footer > div {
  display: flex;
  gap: 8px;
  align-items: center;
}
.demo-workspace h2 {
  margin: 0;
  font-size: 19px;
  overflow-wrap: anywhere;
}
.demo-workspace h3 {
  font-size: 15px;
  margin: 20px 0 8px;
}
.demo-records,
.demo-sequence ol {
  list-style: none;
  margin: 0;
  padding: 0;
}
.demo-record {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  padding: 18px 12px;
  text-align: left;
  cursor: pointer;
  color: inherit;
  gap: 20px;
  font: inherit;
}
.demo-record:hover {
  background: var(--color-bg);
}
.demo-record strong {
  overflow-wrap: anywhere;
}
.demo-record span {
  font-size: 13px;
  color: var(--color-muted);
  flex-shrink: 0;
}
.demo-empty {
  padding: 48px 12px;
  text-align: center;
  color: var(--color-muted);
}
.demo-editor {
  display: grid;
  grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.4fr);
}
.demo-fields {
  padding: 24px;
  border-right: 1px solid var(--color-border);
}
.demo-sequence {
  padding: 24px;
  min-width: 0;
}
.demo-sequence h2 span {
  font-size: 13px;
  color: var(--color-muted);
  font-weight: 400;
}
.demo-workspace label {
  display: block;
  margin: 18px 0 6px;
  font-weight: 600;
}
.demo-workspace :is(input:not([type='checkbox']), textarea, select) {
  width: 100%;
  min-width: 0;
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 9px 11px;
}
.demo-workspace textarea {
  resize: vertical;
  line-height: 1.6;
}
.demo-workspace :is(input, textarea, select):disabled {
  background: var(--color-bg);
  color: var(--color-muted);
}
.demo-workspace .demo-share {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-weight: 400;
  line-height: 1.6;
}
.demo-share input {
  margin-top: 5px;
  accent-color: var(--color-primary);
}
.demo-workspace details {
  margin-top: 14px;
  font-size: 13px;
  line-height: 1.7;
}
.demo-workspace summary {
  cursor: pointer;
  color: var(--color-muted);
}
.demo-workspace details p {
  margin: 6px 0;
}
.demo-sequence li {
  padding: 18px 0 24px;
  border-top: 1px solid var(--color-border);
}
.demo-step-heading {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
.demo-step-heading h3 {
  margin: 0;
  flex-shrink: 0;
}
.demo-step-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}
.demo-step-actions :deep(button) {
  font-size: 12px;
}
.demo-footer {
  padding: 14px 24px;
  justify-content: space-between;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}
.demo-rehearsal {
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
}
.demo-narration {
  padding: 24px;
}
.demo-narration > .demo-text {
  margin: 10px 0 20px;
}
.demo-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-width: 72ch;
  line-height: 1.7;
}
.demo-position {
  margin: 24px 0 8px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.demo-spoken {
  font-size: 16px;
}
.demo-workspace :is(button, input, textarea, select, summary, [tabindex]):focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
.demo-workspace ::selection {
  background: var(--color-primary);
  color: #fff;
}
.demo-workspace :is(input, textarea) {
  caret-color: var(--color-primary);
}
@media (max-width: 700px) {
  .demo-overlay {
    padding: 0;
  }
  .demo-workspace {
    width: 100%;
    height: 100dvh;
    border-radius: 0;
  }
  .demo-header {
    padding: 12px 16px;
    gap: 12px;
  }
  .demo-header h1 {
    font-size: 20px;
  }
  .demo-header > :deep(button) {
    max-width: 132px;
    white-space: normal;
    height: auto;
    min-height: 44px;
  }
  .demo-status {
    padding: 8px 16px;
  }
  .demo-list,
  .demo-fields,
  .demo-sequence,
  .demo-narration {
    padding: 20px 16px;
  }
  .demo-editor,
  .demo-rehearsal {
    display: block;
  }
  .demo-fields {
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }
  .demo-toolbar {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .demo-record {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }
  .demo-step-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .demo-step-actions {
    justify-content: flex-start;
  }
  .demo-footer {
    flex-direction: column;
    align-items: stretch;
    padding: 10px 16px max(10px, env(safe-area-inset-bottom));
    gap: 8px;
  }
  .demo-footer > div {
    flex-wrap: wrap;
  }
  .demo-footer :deep(button) {
    flex: 1;
    height: auto;
    min-height: 44px;
    white-space: normal;
  }
  .demo-workspace :is(select, input:not([type='checkbox'])) {
    min-height: 44px;
  }
  .demo-step-actions :deep(button) {
    min-height: 44px;
  }
  .demo-narration > .demo-text {
    margin-bottom: 12px;
  }
  .demo-position {
    margin-top: 16px;
  }
}
</style>
