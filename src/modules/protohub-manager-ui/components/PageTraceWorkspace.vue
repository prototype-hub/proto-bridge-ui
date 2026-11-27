<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import {
  Alert as AAlert,
  Button as AButton,
  Input as AInput,
  Textarea as ATextarea,
  Select as ASelect,
  Pagination as APagination,
  Tag as ATag,
  Modal,
} from 'ant-design-vue'
import {
  ArrowRightOutlined,
  CloseOutlined,
  PlusOutlined,
  ExportOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { usePageTrace } from '../hooks/usePageTrace'
import { traceSourceKinds } from '../types/page-trace'
import { viewportCategories, viewportResults } from '../types/viewport-check'
import type {
  PageRelation,
  ResolvedTraceSource,
  TraceDecision,
  TraceScope,
  TraceSourceKind,
} from '../types/page-trace'
import { safeWorkItemUrl } from '../views/project/hooks/useWorkItems'
const props = defineProps<{ scope: TraceScope }>()
const emit = defineEmits<{ close: [] }>()
const state = usePageTrace(computed(() => props.scope))
const { t, locale } = useI18n(),
  router = useRouter()
const root = ref<HTMLElement>(),
  heading = ref<HTMLElement>()
const tab = ref<'relations' | 'sources' | 'decisions'>('relations'),
  search = ref('')
const mobileStep = ref<'pages' | 'content'>('content'),
  entryOnly = ref(false)
const focusedRelation = ref('')
const [modal, ModalContextHolder] = Modal.useModal()
const kindKeys = {
  'work-item': 'traceRequirement',
  material: 'traceMaterial',
  description: 'traceDescription',
  check: 'traceCheck',
} as const
const kindOptions = computed(() =>
  traceSourceKinds.map((value) => ({ value, label: t(`proto.${kindKeys[value]}`) })),
)
const pageOptions = computed(() =>
  state.pages.value.map((row) => ({ value: row.pageId, label: row.name })),
)
const entryIds = computed(() => new Set(state.entries.value?.data.map((row) => row.pageId)))
const visiblePages = computed(() =>
  state.pages.value.filter(
    (row) =>
      (!entryOnly.value || entryIds.value.has(row.pageId)) &&
      `${row.name} ${row.path}`.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
  ),
)
const candidateOptions = computed(
  () =>
    state.sourceCandidates.value?.data
      .filter(
        (row) =>
          !state.context.value?.references.some(
            (ref) => ref.id === row.id && ref.kind === row.kind,
          ),
      )
      .map((row) => ({ value: row.id, label: row.title })) || [],
)
const editorDisabled = computed(() => state.locked.value || state.conflict.value)
const selectedSource = computed(() =>
  state.context.value?.references.find(
    (row) => row.kind === state.sourceDetail.value?.kind && row.id === state.sourceDetail.value?.id,
  ),
)
const fieldKeys: Record<string, string> = {
  url: 'workItemUrl',
  note: 'workItemNote',
  type: 'materialFilter',
  description: 'materialNotes',
  purpose: 'specPurpose',
  inputRules: 'specInputRules',
  permissionRules: 'specPermissionRules',
  navigationRules: 'specNavigationRules',
  notes: 'specNotes',
  category: 'viewportCategory',
  expected: 'viewportExpected',
  observed: 'viewportObserved',
  evidence: 'viewportEvidence',
  result: 'viewportResult',
  steps: 'viewportSteps',
}
function fieldText(key: string, value: string) {
  const materials: Record<string, string> = {
    prototype: 'materialPrototype',
    image: 'materialImage',
    document: 'materialDocument',
    link: 'materialLink',
  }
  if (key === 'type' && Object.hasOwn(materials, value)) return t(`proto.${materials[value]}`)
  if (key === 'category' && viewportCategories.some((category) => category === value))
    return t(`proto.viewportCategory_${value}`)
  if (key === 'result' && viewportResults.some((result) => result === value))
    return t(`proto.viewportResult_${value}`)
  return value || '—'
}
function pageName(id: string) {
  return state.pages.value.find((row) => row.pageId === id)?.name || t('proto.traceUnavailable')
}
function href(pageId: string, materialId?: string) {
  return router.resolve({
    name: 'PrototypeHub-preview-window',
    params: { projectId: props.scope.project.id, versionId: props.scope.revision.versionId },
    query: {
      revisionId: props.scope.revision.id,
      pageId,
      ...(materialId ? { tool: 'materials', materialId } : {}),
    },
  }).href
}
function date(value: number) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(
    value,
  )
}
async function confirm(title: string, content: string, okText: string) {
  return new Promise<boolean>((resolve) =>
    modal.confirm({
      zIndex: 1100,
      title,
      content,
      okText,
      cancelText: t('proto.traceKeep'),
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  )
}
async function canLeave() {
  if (state.locked.value) {
    state.error.value = t('proto.traceBusy')
    return false
  }
  return (
    !state.dirty.value ||
    (await confirm(t('proto.traceLeaveTitle'), t('proto.traceLeaveHint'), t('proto.traceLeave')))
  )
}
async function focusHeading() {
  await nextTick()
  heading.value?.focus()
}
async function close() {
  if (await canLeave()) emit('close')
}
async function selectPage(id: string) {
  if (!(await canLeave())) return
  state.selectPage(id)
  mobileStep.value = 'content'
  await focusHeading()
}
async function changeTab(value: typeof tab.value) {
  if (!(await canLeave())) return
  state.clearEditor()
  tab.value = value
  await focusHeading()
}
async function start(kind: 'relation' | 'decision' | 'source', row?: PageRelation | TraceDecision) {
  if (!(await canLeave())) return
  if (kind === 'relation') state.editRelation(row as PageRelation | undefined)
  else if (kind === 'decision') state.editDecision(row as TraceDecision | undefined)
  else state.addSource()
  await nextTick()
  root.value
    ?.querySelector<HTMLElement>('[data-trace-first] input, input[data-trace-first]')
    ?.focus()
}
async function cancel() {
  if (await canLeave()) {
    state.clearEditor()
    await focusHeading()
  }
}
async function save() {
  state.save()
  await nextTick()
  if (state.invalid.value)
    root.value
      ?.querySelector<HTMLElement>('[data-trace-first] input, input[data-trace-first]')
      ?.focus()
}
async function remove(row: PageRelation | TraceDecision, kind: 'relation' | 'decision') {
  if (
    !(await canLeave()) ||
    !(await confirm(
      t('proto.traceRemoveTitle'),
      t('proto.traceRemoveHint'),
      t('proto.traceRemove'),
    ))
  )
    return
  state.remove(row, kind)
  await focusHeading()
}
async function removeSource(ref: ResolvedTraceSource) {
  if (
    await confirm(t('proto.traceRemoveTitle'), t('proto.traceRemoveHint'), t('proto.traceRemove'))
  ) {
    state.removeSource(ref)
    await focusHeading()
  }
}
const sourceTrigger = ref<HTMLElement>()
async function viewSource(source: ResolvedTraceSource, event: Event) {
  sourceTrigger.value = event.currentTarget as HTMLElement
  await state.readSource(source)
  await nextTick()
  const title = root.value?.querySelector<HTMLElement>('.trace-detail h3')
  title?.focus()
  title?.scrollIntoView({ block: 'start' })
}
async function backSource() {
  state.sourceDetail.value = undefined
  await nextTick()
  sourceTrigger.value?.focus()
  sourceTrigger.value?.scrollIntoView({ block: 'nearest' })
}
async function reconnect() {
  if (
    selectedSource.value &&
    (await confirm(
      t('proto.traceReconnectTitle'),
      t('proto.traceReconnectHint'),
      t('proto.traceReconnect'),
    ))
  )
    state.reconnect(selectedSource.value)
}
async function locate(row: PageRelation, fromGraph: boolean) {
  focusedRelation.value = row.id
  await nextTick()
  root.value
    ?.querySelector<HTMLElement>(
      `[data-trace-${fromGraph ? 'row' : 'edge'}="${CSS.escape(row.id)}"]`,
    )
    ?.focus()
}
function entryPage(index: number) {
  state.entryIndex.value = index - 1
  void state.load()
}
function sourcePage(index: number) {
  state.sourceIndex.value = index - 1
  void state.loadSources()
}
function decisionPage(index: number) {
  state.decisionIndex.value = index - 1
  void state.load()
}
function popupContainer(trigger: HTMLElement) {
  return trigger.closest<HTMLElement>('.trace-workspace') || trigger.parentElement!
}
function sourceKind(value: unknown) {
  state.sourceKind.value = value as TraceSourceKind
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
      'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
    ),
  ].filter((item) => item.offsetParent !== null)
  const first = items[0],
    last = items.at(-1)
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
    <div class="trace-overlay">
      <section
        ref="root"
        class="trace-workspace"
        :data-step="mobileStep"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trace-heading"
        @keydown="keydown"
      >
        <header class="trace-header">
          <div>
            <h1 id="trace-heading" ref="heading" tabindex="-1">{{ t('proto.traceTitle') }}</h1>
            <p>
              {{ scope.project.name }} <span>· {{ scope.revision.versionName }}</span>
            </p>
          </div>
          <a-button :aria-label="t('proto.traceClose')" @click="close"
            ><close-outlined aria-hidden="true"
          /></a-button>
        </header>
        <div
          v-if="state.error.value || state.notice.value"
          class="trace-status"
          role="status"
          aria-live="polite"
        >
          <a-alert
            :type="state.error.value ? 'warning' : 'success'"
            :message="state.error.value || state.notice.value"
            show-icon
          >
            <template
              v-if="
                state.unknown.value ||
                state.conflict.value ||
                (state.error.value && !state.denied.value)
              "
              #action
              ><div class="trace-actions">
                <a-button
                  v-if="state.unknown.value"
                  :loading="state.busy.value"
                  @click="state.retry"
                  >{{ t('proto.traceRetry') }}</a-button
                >
                <a-button
                  v-else-if="state.conflict.value"
                  :loading="state.loading.value"
                  @click="state.readCurrent"
                  >{{ t('proto.traceReadCurrent') }}</a-button
                >
                <a-button v-else @click="state.load">{{ t('common.retry') }}</a-button>
              </div></template
            >
          </a-alert>
          <div v-if="state.serverRecord.value" class="trace-server">
            <p>
              {{
                'references' in state.serverRecord.value
                  ? t('proto.traceSources')
                  : 'label' in state.serverRecord.value
                    ? state.serverRecord.value.label
                    : state.serverRecord.value.title
              }}
            </p>
            <a-button @click="state.useCurrent">{{ t('proto.traceUseCurrent') }}</a-button>
          </div>
        </div>
        <div v-if="!state.denied.value" class="trace-body">
          <aside class="trace-pages" :aria-label="t('proto.tracePages')">
            <h2>{{ t('proto.tracePages') }}</h2>
            <a-input
              v-model:value="search"
              :aria-label="t('proto.traceFindPage')"
              :placeholder="t('proto.traceFindPage')"
              name="tracePageSearch"
              autocomplete="off"
              allow-clear
            />
            <div class="trace-page-filter">
              <button :aria-pressed="!entryOnly" @click="entryOnly = false">
                {{ t('proto.traceAllPages') }}</button
              ><button :aria-pressed="entryOnly" @click="entryOnly = true">
                {{ t('proto.traceEntryPages') }}
              </button>
            </div>
            <p v-if="!visiblePages.length" class="trace-empty">{{ t('proto.traceNoPages') }}</p>
            <ul>
              <li v-for="row in visiblePages" :key="row.pageId">
                <button
                  :aria-current="row.pageId === state.pageId.value ? 'page' : undefined"
                  :disabled="state.locked.value"
                  @click="selectPage(row.pageId)"
                >
                  <strong>{{ row.name }}</strong
                  ><span>{{ row.path }}</span
                  ><span v-if="entryIds.has(row.pageId)" class="trace-entry">{{
                    t('proto.traceEntry')
                  }}</span>
                </button>
              </li>
            </ul>
            <a-pagination
              v-if="entryOnly && (state.entries.value?.total || 0) > 20"
              :current="state.entryIndex.value + 1"
              :total="state.entries.value?.total"
              :page-size="20"
              :show-size-changer="false"
              simple
              @change="entryPage"
            />
          </aside>
          <main class="trace-main" :aria-busy="state.loading.value">
            <div class="trace-page-heading">
              <div>
                <a-button class="trace-mobile" @click="mobileStep = 'pages'"
                  ><arrow-left-outlined aria-hidden="true" />{{ t('proto.tracePages') }}</a-button
                >
                <h2>{{ state.page.value?.name }}</h2>
                <span v-if="state.context.value?.entry" class="trace-entry">{{
                  t('proto.traceEntry')
                }}</span
                ><span v-if="!state.canEdit.value" class="muted">{{
                  t('proto.traceReadOnly')
                }}</span>
              </div>
              <div class="trace-actions">
                <a :href="href(state.pageId.value)" target="_blank" rel="noopener noreferrer"
                  >{{ t('proto.traceOpenPage') }}<export-outlined aria-hidden="true" /></a
                ><a-button
                  v-if="state.canEdit.value"
                  :disabled="
                    state.locked.value || state.mode.value !== 'list' || !state.context.value
                  "
                  @click="state.toggleEntry"
                  >{{
                    t(
                      state.context.value?.entry
                        ? 'proto.traceUnmarkEntry'
                        : 'proto.traceMarkEntry',
                    )
                  }}</a-button
                >
              </div>
            </div>
            <nav class="trace-tabs" :aria-label="t('proto.traceTitle')">
              <button
                v-for="name in ['relations', 'sources', 'decisions'] as const"
                :key="name"
                :aria-current="tab === name ? 'page' : undefined"
                :disabled="state.locked.value"
                @click="changeTab(name)"
              >
                {{
                  t(
                    `proto.${name === 'relations' ? 'traceRelations' : name === 'sources' ? 'traceSources' : 'traceDecisions'}`,
                  )
                }}
              </button>
            </nav>
            <div class="trace-content">
              <p
                v-if="state.loading.value || state.sourceLoading.value"
                role="status"
                class="muted"
              >
                {{ t('common.loading') }}…
              </p>
              <form v-if="state.mode.value !== 'list'" class="trace-editor" @submit.prevent="save">
                <div class="trace-section-heading">
                  <h3>
                    {{
                      t(
                        `proto.${state.mode.value === 'relation' ? 'traceNewRelation' : state.mode.value === 'decision' ? 'traceNewDecision' : 'traceNewSource'}`,
                      )
                    }}
                  </h3>
                  <a-button :disabled="state.locked.value" @click="cancel">{{
                    t('proto.traceCancel')
                  }}</a-button>
                </div>
                <p v-if="state.invalid.value" role="alert" class="trace-error">
                  {{ state.invalid.value }}
                </p>
                <fieldset :disabled="state.locked.value || state.conflict.value">
                  <template v-if="state.mode.value === 'relation'">
                    <label for="trace-from">{{ t('proto.traceFrom') }}</label
                    ><a-select
                      id="trace-from"
                      v-model:value="state.relationForm.fromPageId"
                      :get-popup-container="popupContainer"
                      :disabled="editorDisabled"
                      :options="pageOptions"
                      :aria-label="t('proto.traceFrom')"
                    />
                    <label for="trace-to">{{ t('proto.traceTo') }}</label
                    ><a-select
                      id="trace-to"
                      v-model:value="state.relationForm.toPageId"
                      :get-popup-container="popupContainer"
                      :disabled="editorDisabled"
                      :options="
                        pageOptions.filter((row) => row.value !== state.relationForm.fromPageId)
                      "
                      :aria-label="t('proto.traceTo')"
                    />
                    <label for="trace-label">{{ t('proto.traceRelationLabel') }}</label
                    ><a-input
                      id="trace-label"
                      v-model:value="state.relationForm.label"
                      data-trace-first
                      name="traceLabel"
                      autocomplete="off"
                      :maxlength="120"
                      required
                    />
                    <label for="trace-note">{{ t('proto.traceNotes') }}</label
                    ><a-textarea
                      id="trace-note"
                      v-model:value="state.relationForm.note"
                      name="traceNote"
                      autocomplete="off"
                      :maxlength="2000"
                      :rows="4"
                    />
                  </template>
                  <template v-else-if="state.mode.value === 'decision'">
                    <label for="trace-title">{{ t('proto.traceDecisionTitle') }}</label
                    ><a-input
                      id="trace-title"
                      v-model:value="state.decisionForm.title"
                      data-trace-first
                      name="traceDecisionTitle"
                      autocomplete="off"
                      :maxlength="120"
                      required
                    />
                    <label for="trace-decision">{{ t('proto.traceDecision') }}</label
                    ><a-textarea
                      id="trace-decision"
                      v-model:value="state.decisionForm.decision"
                      name="traceDecision"
                      autocomplete="off"
                      :maxlength="2000"
                      :rows="4"
                      required
                    />
                    <label for="trace-rationale">{{ t('proto.traceRationale') }}</label
                    ><a-textarea
                      id="trace-rationale"
                      v-model:value="state.decisionForm.rationale"
                      name="traceRationale"
                      autocomplete="off"
                      :maxlength="2000"
                      :rows="4"
                      required
                    />
                  </template>
                  <template v-else>
                    <label for="trace-kind">{{ t('proto.traceSourceKind') }}</label
                    ><a-select
                      id="trace-kind"
                      :get-popup-container="popupContainer"
                      :disabled="editorDisabled"
                      :value="state.sourceKind.value"
                      :options="kindOptions"
                      :aria-label="t('proto.traceSourceKind')"
                      @change="sourceKind"
                    />
                    <label for="trace-source">{{ t('proto.traceSource') }}</label
                    ><a-select
                      id="trace-source"
                      v-model:value="state.sourceId.value"
                      :get-popup-container="popupContainer"
                      :disabled="editorDisabled"
                      data-trace-first
                      :options="candidateOptions"
                      :loading="state.sourceLoading.value"
                      :aria-label="t('proto.traceSource')"
                      :not-found-content="t('proto.traceNoSources')"
                    />
                    <a-pagination
                      v-if="(state.sourceCandidates.value?.total || 0) > 20"
                      :current="state.sourceIndex.value + 1"
                      :total="state.sourceCandidates.value?.total"
                      :page-size="20"
                      :show-size-changer="false"
                      simple
                      @change="sourcePage"
                    />
                  </template>
                </fieldset>
                <div class="trace-editor-actions">
                  <a-button :disabled="state.locked.value" @click="cancel">{{
                    t('common.cancel')
                  }}</a-button
                  ><a-button
                    type="primary"
                    html-type="submit"
                    :loading="state.busy.value"
                    :disabled="state.unknown.value || state.conflict.value"
                    >{{ t('proto.traceSave') }}</a-button
                  >
                </div>
              </form>
              <template v-else-if="tab === 'relations'">
                <div class="trace-toolbar">
                  <form class="trace-query" @submit.prevent="state.queryRelations()">
                    <a-input
                      v-model:value="state.keyword.value"
                      :aria-label="t('proto.traceSearch')"
                      :placeholder="t('proto.traceSearch')"
                      name="traceRelationSearch"
                      autocomplete="off"
                      :maxlength="120"
                      allow-clear
                    /><a-select
                      v-model:value="state.direction.value"
                      :get-popup-container="popupContainer"
                      :aria-label="t('proto.traceRelations')"
                      :options="[
                        { value: 'all', label: t('proto.traceBoth') },
                        { value: 'outgoing', label: t('proto.traceOutgoing') },
                        { value: 'incoming', label: t('proto.traceIncoming') },
                      ]"
                    /><a-button html-type="submit" :disabled="state.locked.value">{{
                      t('proto.traceSearchAction')
                    }}</a-button>
                  </form>
                  <a-button v-if="state.canEdit.value" type="primary" @click="start('relation')"
                    ><plus-outlined aria-hidden="true" />{{ t('proto.traceNewRelation') }}</a-button
                  >
                </div>
                <section
                  v-if="state.relations.value?.data.length"
                  class="trace-map"
                  :aria-label="t('proto.traceGraph')"
                >
                  <p class="muted">{{ t('proto.traceGraphScope') }}</p>
                  <div
                    v-for="row in state.relations.value.data"
                    :key="row.id"
                    class="trace-edge"
                    :class="{ 'trace-selected': row.id === focusedRelation }"
                  >
                    <a :href="href(row.fromPageId)" target="_blank" rel="noopener noreferrer">{{
                      pageName(row.fromPageId)
                    }}</a
                    ><span class="trace-line" aria-hidden="true"></span
                    ><button
                      :data-trace-edge="row.id"
                      :aria-label="t('proto.traceLocateRelation', { label: row.label })"
                      @click="locate(row, true)"
                    >
                      {{ row.label }}</button
                    ><span class="trace-line" aria-hidden="true"><arrow-right-outlined /></span
                    ><a :href="href(row.toPageId)" target="_blank" rel="noopener noreferrer">{{
                      pageName(row.toPageId)
                    }}</a>
                  </div>
                </section>
                <p v-if="!state.loading.value && !state.relations.value?.total" class="trace-empty">
                  {{ t('proto.traceEmpty') }}
                </p>
                <ul class="trace-records">
                  <li
                    v-for="row in state.relations.value?.data"
                    :key="row.id"
                    :class="{ 'trace-selected': row.id === focusedRelation }"
                  >
                    <div class="trace-record-heading">
                      <button :data-trace-row="row.id" @click="locate(row, false)">
                        <strong>{{ row.label }}</strong>
                      </button>
                      <div v-if="state.canEdit.value" class="trace-actions">
                        <a-button @click="start('relation', row)">{{
                          t('proto.traceEdit')
                        }}</a-button
                        ><a-button
                          danger
                          :disabled="state.locked.value"
                          @click="remove(row, 'relation')"
                          >{{ t('proto.traceRemove') }}</a-button
                        >
                      </div>
                    </div>
                    <p class="trace-path">
                      {{ pageName(row.fromPageId) }} <arrow-right-outlined aria-hidden="true" />
                      {{ pageName(row.toPageId) }}
                    </p>
                    <p v-if="row.note" class="trace-prose">{{ row.note }}</p>
                  </li>
                </ul>
                <a-pagination
                  v-if="(state.relations.value?.total || 0) > 20"
                  :current="state.relationIndex.value + 1"
                  :total="state.relations.value?.total"
                  :page-size="20"
                  :show-size-changer="false"
                  @change="state.queryRelations($event - 1)"
                />
              </template>
              <template v-else-if="tab === 'sources'">
                <div class="trace-section-heading">
                  <h3>{{ t('proto.traceSources') }}</h3>
                  <a-button
                    v-if="state.canEdit.value"
                    type="primary"
                    :disabled="
                      state.locked.value ||
                      !state.context.value ||
                      state.context.value.references.length >= 40
                    "
                    @click="start('source')"
                    ><plus-outlined aria-hidden="true" />{{ t('proto.traceNewSource') }}</a-button
                  >
                </div>
                <p
                  v-if="!state.loading.value && !state.context.value?.references.length"
                  class="trace-empty"
                >
                  {{ t('proto.traceEmpty') }}
                </p>
                <ul class="trace-records">
                  <li
                    v-for="source in state.context.value?.references"
                    :key="`${source.kind}/${source.id}`"
                  >
                    <div class="trace-record-heading">
                      <div>
                        <span class="muted">{{ t(`proto.${kindKeys[source.kind]}`) }}</span>
                        <h3>{{ source.title || t('proto.traceMissing') }}</h3>
                      </div>
                      <a-tag
                        v-if="source.status !== 'current'"
                        :color="source.status === 'changed' ? 'warning' : 'default'"
                        >{{
                          t(
                            source.status === 'changed'
                              ? 'proto.traceChanged'
                              : 'proto.traceMissing',
                          )
                        }}</a-tag
                      >
                    </div>
                    <p v-if="source.status !== 'current'" class="muted">
                      {{
                        t(
                          source.status === 'changed'
                            ? 'proto.traceChangedHint'
                            : 'proto.traceMissingHint',
                        )
                      }}
                    </p>
                    <div class="trace-actions">
                      <a-button
                        v-if="source.status !== 'missing'"
                        :loading="state.sourceLoading.value && selectedSource?.id === source.id"
                        :disabled="state.locked.value"
                        @click="viewSource(source, $event)"
                        >{{ t('proto.traceViewSource') }}</a-button
                      ><a-button
                        v-if="state.canEdit.value"
                        danger
                        :disabled="state.locked.value"
                        @click="removeSource(source)"
                        >{{ t('proto.traceRemove') }}</a-button
                      >
                    </div>
                  </li>
                </ul>
                <section
                  v-if="state.sourceDetail.value"
                  class="trace-detail"
                  :aria-label="t('proto.traceSourceDetail')"
                >
                  <div class="trace-section-heading">
                    <h3 tabindex="-1">{{ state.sourceDetail.value.title }}</h3>
                    <a-button @click="backSource">{{ t('proto.traceBack') }}</a-button>
                  </div>
                  <dl>
                    <template v-for="(value, key) in state.sourceDetail.value.fields" :key="key"
                      ><dt>{{ t(`proto.${fieldKeys[key] || 'traceNotes'}`) }}</dt>
                      <dd>
                        <a
                          v-if="key === 'url' && safeWorkItemUrl(value)"
                          :href="value"
                          target="_blank"
                          rel="noopener noreferrer"
                          >{{ value }} <export-outlined aria-hidden="true" /></a
                        ><span v-else>{{ fieldText(key, value) }}</span>
                      </dd></template
                    >
                  </dl>
                  <a
                    v-if="state.sourceDetail.value.kind === 'material'"
                    :href="href(state.pageId.value, state.sourceDetail.value.id)"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ t('proto.traceViewSource') }}<export-outlined aria-hidden="true" /></a
                  ><a-button
                    v-if="state.canEdit.value && selectedSource?.status === 'changed'"
                    :disabled="state.locked.value"
                    @click="reconnect"
                    >{{ t('proto.traceReconnect') }}</a-button
                  >
                </section>
              </template>
              <template v-else>
                <div class="trace-section-heading">
                  <h3>{{ t('proto.traceDecisions') }}</h3>
                  <a-button v-if="state.canEdit.value" type="primary" @click="start('decision')"
                    ><plus-outlined aria-hidden="true" />{{ t('proto.traceNewDecision') }}</a-button
                  >
                </div>
                <p v-if="!state.loading.value && !state.decisions.value?.total" class="trace-empty">
                  {{ t('proto.traceEmpty') }}
                </p>
                <ul class="trace-records">
                  <li v-for="row in state.decisions.value?.data" :key="row.id">
                    <div class="trace-record-heading">
                      <h3>{{ row.title }}</h3>
                      <div v-if="state.canEdit.value" class="trace-actions">
                        <a-button @click="start('decision', row)">{{
                          t('proto.traceEdit')
                        }}</a-button
                        ><a-button
                          danger
                          :disabled="state.locked.value"
                          @click="remove(row, 'decision')"
                          >{{ t('proto.traceRemove') }}</a-button
                        >
                      </div>
                    </div>
                    <dl>
                      <dt>{{ t('proto.traceDecision') }}</dt>
                      <dd>{{ row.decision }}</dd>
                      <dt>{{ t('proto.traceRationale') }}</dt>
                      <dd>{{ row.rationale }}</dd>
                    </dl>
                    <p class="muted trace-audit">
                      {{ t('proto.traceAuthor') }} <span translate="no">{{ row.authorId }}</span> ·
                      <time :datetime="new Date(row.updatedAt).toISOString()">{{
                        date(row.updatedAt)
                      }}</time>
                    </p>
                  </li>
                </ul>
                <a-pagination
                  v-if="(state.decisions.value?.total || 0) > 20"
                  :current="state.decisionIndex.value + 1"
                  :total="state.decisions.value?.total"
                  :page-size="20"
                  :show-size-changer="false"
                  @change="decisionPage"
                />
              </template>
            </div>
          </main>
        </div>
        <modal-context-holder />
      </section>
    </div>
  </teleport>
</template>
<style scoped>
.trace-overlay {
  position: fixed;
  inset: 0;
  z-index: 1050;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(15 23 42 / 42%);
}
.trace-workspace {
  display: flex;
  flex-direction: column;
  width: min(1320px, 100%);
  height: min(920px, 100%);
  min-width: 0;
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: var(--radius);
  box-shadow: 0 18px 60px rgb(15 23 42 / 24%);
  overflow: hidden;
}
.trace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--color-border);
}
.trace-header h1 {
  margin: 0;
  font-size: 22px;
  text-wrap: balance;
}
.trace-header p {
  margin: 4px 0 0;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}
.trace-header > div,
.trace-body > *,
.trace-page-heading > *,
.trace-record-heading > * {
  min-width: 0;
}
.trace-status {
  padding: 12px 24px;
}
.trace-server,
.trace-actions,
.trace-editor-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.trace-body {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}
.trace-pages {
  padding: 22px 16px;
  border-right: 1px solid var(--color-border);
  overflow: auto;
  overscroll-behavior: contain;
}
.trace-workspace h2 {
  font-size: 18px;
  margin: 0 0 16px;
  text-wrap: balance;
  overflow-wrap: anywhere;
}
.trace-workspace h3 {
  font-size: 16px;
  margin: 0;
  text-wrap: balance;
  overflow-wrap: anywhere;
}
.trace-page-filter {
  display: flex;
  gap: 12px;
  margin: 14px 0;
}
.trace-page-filter button {
  padding: 4px 0;
  border: 0;
  background: none;
  color: var(--color-muted);
  cursor: pointer;
}
.trace-page-filter button[aria-pressed='true'] {
  color: var(--color-primary);
  font-weight: 600;
}
.trace-pages ul,
.trace-records {
  list-style: none;
  padding: 0;
  margin: 0;
}
.trace-pages li > button {
  display: grid;
  gap: 4px;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--color-text);
  border-radius: var(--radius);
  padding: 12px 10px;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.trace-pages li > button:hover {
  background: var(--color-background);
}
.trace-pages li > button[aria-current] {
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
  color: var(--color-primary);
}
.trace-pages li span {
  font-size: 12px;
  color: var(--color-muted);
}
.trace-entry {
  font-size: 12px;
  color: var(--color-primary);
}
.trace-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.trace-page-heading {
  padding: 22px 24px 16px;
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
}
.trace-page-heading > div > .muted {
  margin-inline-start: var(--space-2);
}
.trace-page-heading h2 {
  margin-bottom: 4px;
}
.trace-page-heading a,
.trace-detail a {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.trace-tabs {
  display: flex;
  gap: 24px;
  padding: 0 24px;
  border-bottom: 1px solid var(--color-border);
}
.trace-tabs button {
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--color-muted);
  padding: 12px 0;
  cursor: pointer;
}
.trace-tabs button[aria-current] {
  border-bottom-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 600;
}
.trace-content {
  padding: 24px;
  overflow: auto;
  flex: 1;
  min-height: 0;
  overscroll-behavior: contain;
}
.trace-toolbar,
.trace-section-heading,
.trace-record-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}
.trace-toolbar,
.trace-section-heading {
  margin-bottom: 20px;
}
.trace-query {
  display: flex;
  gap: 8px;
  min-width: 0;
}
.trace-query > .ant-input-affix-wrapper {
  width: 240px;
}
.trace-query > .ant-select {
  min-width: 136px;
}
.trace-map {
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 8px;
  padding: 0 0 20px;
  max-height: 250px;
  overflow: auto;
}
.trace-map > p {
  margin: 0 0 12px;
  font-size: 12px;
}
.trace-edge {
  display: grid;
  grid-template-columns: minmax(70px, 1fr) 24px minmax(100px, 1.5fr) 24px minmax(70px, 1fr);
  align-items: center;
  gap: 6px;
  padding: 8px;
}
.trace-edge > a {
  overflow-wrap: anywhere;
  text-align: center;
}
.trace-edge > button {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  padding: 8px 12px;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.trace-line {
  position: relative;
  height: 1px;
  background: var(--color-border);
}
.trace-line :deep(svg) {
  position: absolute;
  right: -2px;
  top: -6px;
}
.trace-records > li {
  padding: 18px 0;
  border-bottom: 1px solid var(--color-border);
}
.trace-record-heading > button {
  border: 0;
  padding: 0;
  text-align: left;
  color: var(--color-text);
  background: transparent;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.trace-path,
.trace-prose {
  margin: 10px 0 0;
  overflow-wrap: anywhere;
}
.trace-path {
  color: var(--color-muted);
  font-size: 13px;
}
.trace-prose,
.trace-workspace dd {
  white-space: pre-wrap;
  max-width: 75ch;
}
.trace-selected {
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
}
.trace-empty {
  padding: 32px 0;
  color: var(--color-muted);
}
.trace-editor {
  max-width: 680px;
}
.trace-editor fieldset {
  border: 0;
  padding: 0;
  min-width: 0;
  display: grid;
  gap: 8px;
}
.trace-editor label:not(:first-child) {
  margin-top: 12px;
}
.trace-editor fieldset > .ant-select,
.trace-editor fieldset > .ant-input {
  width: 100%;
}
.trace-editor-actions {
  margin-top: 24px;
}
.trace-error {
  color: #b42318;
}
.trace-detail {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--color-border);
}
.trace-workspace dl {
  margin: 16px 0;
}
.trace-workspace dt {
  font-weight: 600;
  margin: 12px 0 4px;
}
.trace-workspace dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.trace-audit {
  font-size: 12px;
  overflow-wrap: anywhere;
}
.trace-workspace :is(button, a, input, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
.trace-workspace button,
.trace-workspace a {
  touch-action: manipulation;
}
.trace-workspace .ant-pagination {
  margin-top: 20px;
}
.trace-mobile {
  display: none;
}
@media (max-width: 1000px) {
  .trace-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .trace-toolbar > .ant-btn {
    align-self: start;
  }
}
@media (max-width: 700px) {
  .trace-overlay {
    padding: 0;
  }
  .trace-workspace {
    height: 100dvh;
    width: 100%;
    border-radius: 0;
  }
  .trace-header {
    padding: 16px;
    gap: 12px;
  }
  .trace-header h1 {
    font-size: 19px;
  }
  .trace-body {
    display: block;
    overflow: hidden;
  }
  .trace-pages {
    height: 100%;
    border: 0;
    padding: 20px 16px;
  }
  .trace-main {
    height: 100%;
  }
  [data-step='pages'] .trace-main,
  [data-step='content'] .trace-pages {
    display: none;
  }
  .trace-mobile {
    display: inline-flex;
    margin-bottom: 12px;
  }
  .trace-page-heading {
    padding: 16px;
    align-items: start;
    flex-direction: column;
  }
  .trace-tabs {
    padding: 0 16px;
    gap: 20px;
  }
  .trace-tabs button {
    min-height: 44px;
  }
  .trace-content {
    padding: 20px 16px max(20px, env(safe-area-inset-bottom));
  }
  .trace-status {
    padding: 10px 16px;
  }
  .trace-query {
    flex-wrap: wrap;
  }
  .trace-query > .ant-input-affix-wrapper {
    width: 100%;
  }
  .trace-query > .ant-select {
    flex: 1;
  }
  .trace-record-heading,
  .trace-section-heading {
    align-items: start;
    flex-wrap: wrap;
    gap: 12px;
  }
  .trace-edge {
    grid-template-columns: minmax(50px, 1fr) 12px minmax(90px, 1.4fr) 12px minmax(50px, 1fr);
    padding-inline: 0;
    gap: 3px;
    font-size: 12px;
  }
  .trace-edge > button {
    padding: 8px 6px;
  }
  .trace-actions > .ant-btn {
    min-height: 40px;
  }
}
</style>
