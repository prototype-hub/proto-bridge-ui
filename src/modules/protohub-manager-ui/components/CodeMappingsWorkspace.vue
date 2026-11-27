<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import {
  Alert as AAlert,
  Button as AButton,
  Checkbox as ACheckbox,
  Input as AInput,
  Textarea as ATextarea,
  Select as ASelect,
  Pagination as APagination,
  Modal,
} from 'ant-design-vue'
import {
  ArrowLeftOutlined,
  CloseOutlined,
  PlusOutlined,
  ImportOutlined,
  ExportOutlined,
  CodeOutlined,
  CopyOutlined,
  AimOutlined,
} from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { copyText } from '@/shared/utils/feedback'
import { useCodeMappings } from '../hooks/useCodeMappings'
import {
  codeMappingFields,
  type CodeMappingField,
  type CodeMappingIssue,
} from '../utils/code-mapping'
import { validLinkUrl } from '../utils/material-source'
import { isReviewAnchor } from '../utils/review-anchor'
import type { CodeMappingCard, CodeMappingScope } from '../types/code-mapping'
import type { ReviewAnchor } from '../types'

const props = defineProps<{ scope: CodeMappingScope }>()
const emit = defineEmits<{ close: []; locate: [value: { pageId: string; anchor: ReviewAnchor }] }>()
const state = useCodeMappings(computed(() => props.scope))
const { t, locale } = useI18n()
const root = ref<HTMLElement>(),
  heading = ref<HTMLElement>(),
  fileInput = ref<HTMLInputElement>(),
  notice = ref<HTMLElement>()
const mobileStep = ref<'pages' | 'content'>('content'),
  mobilePane = ref<'list' | 'detail'>('list')
const pageSearch = ref('')
const [modal, ModalContextHolder] = Modal.useModal()
const fieldKeys: Record<CodeMappingField, string> = {
  alias: 'codeAlias',
  repositoryPath: 'codeRepositoryPath',
  repositoryUrl: 'codeRepositoryUrl',
  documentationUrl: 'codeDocumentationUrl',
  snippet: 'codeSnippet',
  framework: 'codeFramework',
  frameworkVersion: 'codeFrameworkVersion',
}
const sourceFields = [
  'purpose',
  'inputRules',
  'permissionRules',
  'navigationRules',
  'notes',
] as const
const sourceKeys = {
  purpose: 'specPurpose',
  inputRules: 'specInputRules',
  permissionRules: 'specPermissionRules',
  navigationRules: 'specNavigationRules',
  notes: 'specNotes',
} as const
const editDisabled = computed(
  () => !state.canEdit.value || state.locked.value || state.conflict.value,
)
const visiblePages = computed(() =>
  state.pages.value.filter((page) =>
    `${page.name} ${page.path}`.toLocaleLowerCase().includes(pageSearch.value.toLocaleLowerCase()),
  ),
)
const sourceOptions = computed(() => {
  const values =
    state.descriptions.value?.data.map((row) => ({ value: row.id, label: row.title })) || []
  const refs =
    state.mode.value === 'import'
      ? state.importCards.value.map((card) => card.description)
      : [state.form.description]
  for (const selected of refs) {
    if (selected && !values.some((row) => row.value === selected.id))
      values.push({
        value: selected.id,
        label:
          state.descriptionLabels.value.get(selected.id) ||
          (state.original.value?.description?.id === selected.id
            ? state.original.value.description.title
            : null) ||
          t('proto.codeSourceMissing'),
      })
  }
  return values
})
const sourceConfirmed = computed(() => {
  const detail = state.descriptionDetail.value
  const ref =
    state.mode.value === 'edit' ? state.form.description : state.selected.value?.description
  return !!detail && !!ref && detail.id === ref.id && detail.configVersion === ref.expectedVersion
})
const canLocate = computed(
  () => sourceConfirmed.value && isReviewAnchor(state.descriptionDetail.value?.anchor),
)
watch(state.notice, async (value) => {
  if (value) {
    await nextTick()
    notice.value?.focus()
  }
})
function issueText(issue: CodeMappingIssue) {
  const prefix =
    issue.index === undefined
      ? ''
      : t('proto.codeIssueAt', {
          index: issue.index + 1,
          field: issue.field ? t(`proto.${fieldKeys[issue.field]}`) : t('proto.codeMappings'),
        }) + ' — '
  return prefix + t(`proto.codeIssue_${issue.reason}`)
}
function errors(field: CodeMappingField) {
  return state.issues.value.filter((issue) => issue.field === field)
}
function popupContainer(trigger: HTMLElement) {
  return trigger.closest<HTMLElement>('.code-workspace') || trigger.parentElement!
}
function date(value: number) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(
    value,
  )
}
function confirm(title: string, content: string, okText: string) {
  return new Promise<boolean>((resolve) =>
    modal.confirm({
      zIndex: 1100,
      title,
      content,
      okText,
      cancelText: t('proto.codeKeep'),
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  )
}
async function canLeave() {
  if (state.locked.value) {
    state.error.value = t('proto.codeBusy')
    return false
  }
  return (
    !state.dirty.value ||
    (await confirm(t('proto.codeLeaveTitle'), t('proto.codeLeaveHint'), t('proto.codeLeave')))
  )
}
async function focusHeading() {
  await nextTick()
  heading.value?.focus()
}
async function close() {
  if (await canLeave()) emit('close')
}
async function choosePage(id: string) {
  if (!(await canLeave())) return
  state.selectPage(id)
  mobileStep.value = 'content'
  mobilePane.value = 'list'
  await focusHeading()
}
async function show(row: CodeMappingCard) {
  if (!(await canLeave())) return
  if (!(await state.show(row))) return
  mobilePane.value = 'detail'
  await focusHeading()
}
async function edit(row?: CodeMappingCard) {
  if (!(await canLeave())) return
  state.edit(row)
  mobileStep.value = 'content'
  mobilePane.value = 'detail'
  await nextTick()
  root.value?.querySelector<HTMLInputElement>('#code-alias')?.focus()
}
async function startImport() {
  if (!(await canLeave())) return
  state.startImport()
  mobileStep.value = 'content'
  mobilePane.value = 'detail'
  await focusHeading()
}
async function cancel() {
  if (!(await canLeave())) return
  state.clearEditor()
  mobilePane.value = state.selected.value ? 'detail' : 'list'
  await focusHeading()
}
async function remove(row: CodeMappingCard) {
  if (
    !(await canLeave()) ||
    !(await confirm(
      t('proto.codeRemoveTitle', { alias: row.alias }),
      t('proto.codeRemoveHint'),
      t('proto.codeRemove'),
    ))
  )
    return
  state.remove(row)
}
async function exportSelected() {
  if (
    await confirm(
      t('proto.codeExportTitle'),
      t('proto.codeExportHint'),
      t('proto.codeExportDownload'),
    )
  )
    await state.exportSelected()
}
async function save() {
  state.save()
  await nextTick()
  if (state.issues.value.length)
    root.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}
async function readSource() {
  if (
    !(await state.readDescription(
      state.mode.value === 'edit' ? state.form.description : state.selected.value?.description,
    ))
  )
    return
  await nextTick()
  root.value?.querySelector<HTMLElement>('#code-source-heading')?.focus()
}
function locate() {
  if (
    !canLocate.value ||
    !state.descriptionDetail.value?.anchor ||
    !state.target.value ||
    state.dirty.value
  )
    return
  emit('locate', {
    pageId: state.target.value.pageId,
    anchor: { ...state.descriptionDetail.value.anchor },
  })
}
function fileChanged(event: Event) {
  const input = event.target as HTMLInputElement
  void state.readFile(input.files?.[0])
  input.value = ''
}
function chooseDescription(value: unknown, index?: number) {
  state.chooseDescription(typeof value === 'string' ? value : undefined, index)
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
    <div class="code-overlay">
      <section
        ref="root"
        class="code-workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-heading"
        :data-step="mobileStep"
        :data-pane="mobilePane"
        :data-mode="state.mode.value"
        @keydown="keydown"
      >
        <header class="code-header">
          <div class="code-heading-group">
            <h1 id="code-heading" ref="heading" tabindex="-1">{{ t('proto.codeMappings') }}</h1>
            <p>{{ scope.project.name }} <span>·</span> {{ scope.revision.versionName }}</p>
          </div>
          <div class="code-actions">
            <span v-if="!state.canEdit.value && !state.denied.value" class="code-muted">{{
              t('proto.codeReadOnly')
            }}</span>
            <a-button
              v-if="state.canEdit.value"
              :disabled="state.locked.value || !state.page.value"
              @click="startImport"
            >
              <import-outlined aria-hidden="true" />{{ t('proto.codeImport') }}
            </a-button>
            <a-button
              v-if="state.canEdit.value"
              type="primary"
              :disabled="state.locked.value || !state.page.value"
              @click="edit()"
            >
              <plus-outlined aria-hidden="true" />{{ t('proto.codeNew') }}
            </a-button>
            <a-button type="text" :aria-label="t('proto.codeClose')" @click="close"
              ><close-outlined aria-hidden="true"
            /></a-button>
          </div>
        </header>
        <div class="code-feedback" aria-live="polite">
          <a-alert v-if="state.error.value" :message="state.error.value" type="error" show-icon>
            <template #action>
              <a-button
                v-if="state.unknown.value"
                :loading="state.busy.value"
                @click="state.retry"
                >{{ t('proto.codeRetry') }}</a-button
              >
              <a-button
                v-else-if="state.conflict.value && state.original.value"
                :loading="state.loading.value"
                @click="state.readCurrent"
                >{{ t('proto.codeReadServer') }}</a-button
              >
              <a-button
                v-else-if="state.conflict.value && state.sourceConflict.value"
                @click="state.reviseRejected"
                >{{ t('proto.codeRevise') }}</a-button
              >
              <a-button
                v-else-if="!state.denied.value"
                :disabled="state.locked.value"
                @click="state.load"
                >{{ t('proto.codeReload') }}</a-button
              >
            </template>
          </a-alert>
          <p v-if="state.notice.value" ref="notice" role="status" tabindex="-1">
            {{ state.notice.value }}
          </p>
        </div>
        <div v-if="!state.denied.value" class="code-body">
          <aside class="code-pages" :aria-label="t('proto.codePages')">
            <h2>{{ t('proto.codePages') }}</h2>
            <a-input
              v-model:value="pageSearch"
              :aria-label="t('proto.codePageSearch')"
              :placeholder="t('proto.codePageSearch')"
              allow-clear
            />
            <nav>
              <button
                v-for="page in visiblePages"
                :key="page.pageId"
                type="button"
                :aria-current="state.pageId.value === page.pageId ? 'page' : undefined"
                :disabled="state.locked.value"
                @click="choosePage(page.pageId)"
              >
                <span>{{ page.name }}</span
                ><small>{{ page.path }}</small>
              </button>
            </nav>
            <p v-if="!state.pages.value.length" class="code-muted">{{ t('proto.codeNoPages') }}</p>
            <details class="code-scope">
              <summary>{{ t('proto.codeScope') }}</summary>
              <p>{{ scope.revision.id }}</p>
              <p>{{ state.page.value?.path }}</p>
            </details>
          </aside>
          <main
            v-if="state.page.value"
            class="code-main"
            :aria-busy="state.loading.value || state.busy.value"
          >
            <div class="code-page-heading">
              <a-button
                class="code-mobile-pages"
                :disabled="state.locked.value"
                @click="mobileStep = 'pages'"
                ><arrow-left-outlined aria-hidden="true" />{{ t('proto.codePages') }}</a-button
              >
              <h2>{{ state.page.value.name }}</h2>
              <span class="code-path">{{ state.page.value.path }}</span>
            </div>
            <section
              v-if="state.serverRecord.value"
              class="code-server"
              aria-labelledby="code-server-heading"
            >
              <h3 id="code-server-heading">{{ t('proto.codeServer') }}</h3>
              <strong>{{ state.serverRecord.value.alias }}</strong>
              <p class="code-path">{{ state.serverRecord.value.repositoryPath }}</p>
              <p>
                {{ state.serverRecord.value.framework }}
                {{ state.serverRecord.value.frameworkVersion }}
              </p>
              <div class="code-links">
                <a
                  v-for="field in ['repositoryUrl', 'documentationUrl'] as const"
                  v-show="
                    state.serverRecord.value[field] && validLinkUrl(state.serverRecord.value[field])
                  "
                  :key="field"
                  :href="
                    validLinkUrl(state.serverRecord.value[field])
                      ? state.serverRecord.value[field]
                      : undefined
                  "
                  target="_blank"
                  rel="noopener noreferrer"
                  >{{ t(`proto.${fieldKeys[field]}`) }}</a
                >
              </div>
              <pre tabindex="0">{{ state.serverRecord.value.snippet }}</pre>
              <div class="code-actions">
                <a-button @click="state.resolveConflict(false)">{{
                  t('proto.codeUseServer')
                }}</a-button>
                <a-button v-if="state.mode.value === 'edit'" @click="state.resolveConflict(true)">{{
                  t('proto.codeKeepDraft')
                }}</a-button>
              </div>
            </section>
            <template v-if="state.mode.value === 'browse'">
              <div class="code-browser">
                <section class="code-list" :aria-label="t('proto.codeMappings')">
                  <form class="code-query" @submit.prevent="state.query()">
                    <a-input
                      v-model:value="state.keyword.value"
                      :maxlength="120"
                      :disabled="state.locked.value"
                      :aria-label="t('proto.codeSearch')"
                      :placeholder="t('proto.codeSearch')"
                      allow-clear
                    />
                    <a-button html-type="submit" :disabled="state.locked.value">{{
                      t('proto.codeFind')
                    }}</a-button>
                  </form>
                  <div v-if="state.selectedIds.value.length" class="code-selection">
                    <a-button :disabled="state.locked.value" @click="exportSelected"
                      ><export-outlined aria-hidden="true" />{{
                        t('proto.codeExport', { count: state.selectedIds.value.length })
                      }}</a-button
                    >
                    <a-button
                      type="link"
                      :disabled="state.locked.value"
                      @click="state.selectedIds.value = []"
                      >{{ t('proto.codeClearSelection') }}</a-button
                    >
                  </div>
                  <p v-if="state.rows.value" class="code-count">
                    {{ t('proto.codeCount', { count: state.rows.value.total }) }}
                  </p>
                  <p v-if="state.loading.value && !state.rows.value" class="code-muted">
                    {{ t('proto.codeLoading') }}
                  </p>
                  <div
                    v-else-if="state.rows.value && !state.rows.value.data.length"
                    class="code-empty"
                  >
                    <code-outlined aria-hidden="true" />
                    <h3>
                      {{
                        t(state.appliedKeyword.value ? 'proto.codeNoMatches' : 'proto.codeEmpty')
                      }}
                    </h3>
                    <p v-if="!state.appliedKeyword.value">{{ t('proto.codeEmptyHint') }}</p>
                    <a-button
                      v-if="state.canEdit.value && !state.appliedKeyword.value"
                      type="primary"
                      @click="edit()"
                      >{{ t('proto.codeNew') }}</a-button
                    >
                  </div>
                  <ul v-else class="code-rows">
                    <li
                      v-for="row in state.rows.value?.data"
                      :key="row.id"
                      :class="{ 'code-row-selected': state.selected.value?.id === row.id }"
                    >
                      <a-checkbox
                        :checked="state.selectedIds.value.includes(row.id)"
                        :disabled="
                          state.locked.value ||
                          (state.selectedIds.value.length >= 50 &&
                            !state.selectedIds.value.includes(row.id))
                        "
                        :aria-label="t('proto.codeChoose', { alias: row.alias })"
                        @change="state.toggleSelection(row.id, $event.target.checked)"
                      />
                      <button
                        type="button"
                        class="code-row-open"
                        :disabled="state.locked.value"
                        :aria-current="state.selected.value?.id === row.id ? 'true' : undefined"
                        @click="show(row)"
                      >
                        <strong>{{ row.alias }}</strong
                        ><span class="code-path">{{ row.repositoryPath }}</span>
                        <small v-if="row.framework || row.frameworkVersion"
                          >{{ row.framework }} {{ row.frameworkVersion }}</small
                        >
                        <small
                          v-if="row.description && row.description.status !== 'current'"
                          class="code-source-warning"
                          >{{
                            t(
                              row.description.status === 'changed'
                                ? 'proto.codeSourceChanged'
                                : 'proto.codeSourceMissing',
                            )
                          }}</small
                        >
                      </button>
                    </li>
                  </ul>
                  <a-pagination
                    v-if="state.rows.value && state.rows.value.total > 20"
                    :current="state.pageIndex.value + 1"
                    :total="state.rows.value.total"
                    :page-size="20"
                    :show-size-changer="false"
                    :disabled="state.locked.value"
                    simple
                    @change="state.query($event - 1)"
                  />
                </section>
                <section class="code-detail">
                  <a-button class="code-mobile-back" @click="mobilePane = 'list'"
                    ><arrow-left-outlined aria-hidden="true" />{{ t('proto.codeBack') }}</a-button
                  >
                  <template v-if="state.selected.value">
                    <div class="code-detail-heading">
                      <h3>{{ state.selected.value.alias }}</h3>
                      <a-button
                        v-if="state.canEdit.value"
                        :disabled="state.locked.value || state.conflict.value"
                        @click="edit(state.selected.value)"
                        >{{ t('proto.codeEdit') }}</a-button
                      >
                    </div>
                    <div class="code-path-box">
                      <code>{{ state.selected.value.repositoryPath }}</code
                      ><a-button
                        type="text"
                        @click="copyText(state.selected.value.repositoryPath, root)"
                        ><copy-outlined aria-hidden="true" />{{ t('proto.codeCopyPath') }}</a-button
                      >
                    </div>
                    <p
                      v-if="state.selected.value.framework || state.selected.value.frameworkVersion"
                      class="code-framework"
                    >
                      {{ state.selected.value.framework }}
                      {{ state.selected.value.frameworkVersion }}
                    </p>
                    <div class="code-links">
                      <a
                        v-for="field in ['repositoryUrl', 'documentationUrl'] as const"
                        v-show="
                          state.selected.value[field] && validLinkUrl(state.selected.value[field])
                        "
                        :key="field"
                        :href="
                          validLinkUrl(state.selected.value[field])
                            ? state.selected.value[field]
                            : undefined
                        "
                        target="_blank"
                        rel="noopener noreferrer"
                        >{{ t(`proto.${fieldKeys[field]}`) }}</a
                      >
                    </div>
                    <div v-if="state.selected.value.description" class="code-association">
                      <strong>{{
                        state.selected.value.description.title || t('proto.codeSourceMissing')
                      }}</strong>
                      <p
                        v-if="state.selected.value.description.status !== 'current'"
                        class="code-source-warning"
                      >
                        {{
                          t(
                            state.selected.value.description.status === 'changed'
                              ? 'proto.codeSourceChanged'
                              : 'proto.codeSourceMissing',
                          )
                        }}
                      </p>
                      <div class="code-actions">
                        <a-button
                          :loading="state.descriptionLoading.value"
                          :disabled="state.locked.value"
                          @click="readSource"
                          >{{ t('proto.codeViewSource') }}</a-button
                        >
                        <a-button
                          v-if="
                            state.canEdit.value &&
                            state.selected.value.description.status !== 'current'
                          "
                          :disabled="state.locked.value"
                          @click="edit(state.selected.value)"
                          >{{ t('proto.codeSourceRebind') }}</a-button
                        >
                      </div>
                    </div>
                    <section class="code-snippet">
                      <div class="code-section-title">
                        <h4>{{ t('proto.codeSnippet') }}</h4>
                        <a-button
                          v-if="state.selected.value.snippet"
                          type="text"
                          @click="copyText(state.selected.value.snippet, root)"
                          ><copy-outlined aria-hidden="true" />{{
                            t('proto.codeCopySnippet')
                          }}</a-button
                        >
                      </div>
                      <pre v-if="state.selected.value.snippet" tabindex="0">{{
                        state.selected.value.snippet
                      }}</pre>
                      <p v-else class="code-muted">{{ t('proto.codeSnippetEmpty') }}</p>
                    </section>
                    <footer class="code-detail-footer">
                      <time :datetime="new Date(state.selected.value.updatedAt).toISOString()">{{
                        date(state.selected.value.updatedAt)
                      }}</time>
                      <a-button
                        v-if="state.canEdit.value"
                        danger
                        type="text"
                        :disabled="state.locked.value || state.conflict.value"
                        @click="remove(state.selected.value)"
                        >{{ t('proto.codeRemove') }}</a-button
                      >
                    </footer>
                  </template>
                  <p v-else class="code-select-hint">{{ t('proto.codeSelect') }}</p>
                </section>
              </div>
            </template>
            <form
              v-else-if="state.mode.value === 'edit'"
              class="code-editor"
              @submit.prevent="save"
            >
              <h3>{{ t(state.original.value ? 'proto.codeEdit' : 'proto.codeNewHeading') }}</h3>
              <fieldset :disabled="editDisabled">
                <div class="code-field-grid">
                  <div
                    v-for="field in codeMappingFields.filter((value) => value !== 'snippet')"
                    :key="field"
                    class="code-field"
                    :class="{
                      'code-field-wide': !['framework', 'frameworkVersion'].includes(field),
                    }"
                  >
                    <label :for="`code-${field === 'alias' ? 'alias' : field}`"
                      >{{ t(`proto.${fieldKeys[field]}`)
                      }}<span
                        v-if="field === 'alias' || field === 'repositoryPath'"
                        aria-hidden="true"
                      >
                        *</span
                      ></label
                    >
                    <a-input
                      :id="`code-${field}`"
                      v-model:value="state.form[field]"
                      :maxlength="
                        ['repositoryPath', 'repositoryUrl', 'documentationUrl'].includes(field)
                          ? 2048
                          : 120
                      "
                      :disabled="editDisabled"
                      :aria-required="field === 'alias' || field === 'repositoryPath'"
                      :aria-invalid="errors(field).length ? true : undefined"
                      :aria-describedby="errors(field).length ? `code-error-${field}` : undefined"
                      autocomplete="off"
                    />
                    <p
                      v-if="errors(field).length"
                      :id="`code-error-${field}`"
                      class="code-field-error"
                    >
                      {{ issueText(errors(field)[0]!) }}
                    </p>
                  </div>
                </div>
                <div class="code-field">
                  <label for="code-snippet">{{ t('proto.codeSnippet') }}</label
                  ><a-textarea
                    id="code-snippet"
                    v-model:value="state.form.snippet"
                    class="code-code-input"
                    :maxlength="16000"
                    :rows="10"
                    :disabled="editDisabled"
                    :aria-invalid="errors('snippet').length ? true : undefined"
                    :aria-describedby="errors('snippet').length ? 'code-error-snippet' : undefined"
                    spellcheck="false"
                  />
                  <p
                    v-if="errors('snippet').length"
                    id="code-error-snippet"
                    class="code-field-error"
                  >
                    {{ issueText(errors('snippet')[0]!) }}
                  </p>
                </div>
                <section class="code-source-picker">
                  <label for="code-description">{{ t('proto.codeSource') }}</label>
                  <div class="code-query">
                    <a-input
                      v-model:value="state.descriptionKeyword.value"
                      :aria-label="t('proto.codeSourceSearch')"
                      :placeholder="t('proto.codeSourceSearch')"
                      :maxlength="120"
                      :disabled="editDisabled"
                      @press-enter.prevent="state.loadDescriptions(0)"
                    /><a-button :disabled="editDisabled" @click="state.loadDescriptions(0)">{{
                      t('proto.codeFind')
                    }}</a-button>
                  </div>
                  <a-select
                    id="code-description"
                    :value="state.form.description?.id"
                    :options="sourceOptions"
                    :placeholder="t('proto.codeNoSource')"
                    :aria-label="t('proto.codeSource')"
                    :get-popup-container="popupContainer"
                    :disabled="editDisabled"
                    :loading="state.descriptionLoading.value"
                    allow-clear
                    @change="chooseDescription($event)"
                  />
                  <a-pagination
                    v-if="state.descriptions.value && state.descriptions.value.total > 20"
                    :current="state.descriptionIndex.value + 1"
                    :total="state.descriptions.value.total"
                    :page-size="20"
                    :show-size-changer="false"
                    simple
                    :disabled="editDisabled"
                    @change="state.loadDescriptions($event - 1)"
                  />
                  <a-button
                    v-if="state.form.description"
                    :loading="state.descriptionLoading.value"
                    :disabled="state.locked.value"
                    @click="readSource"
                    >{{ t('proto.codeViewSource') }}</a-button
                  >
                </section>
              </fieldset>
              <div class="code-editor-actions">
                <a-button
                  type="primary"
                  html-type="submit"
                  :loading="state.busy.value"
                  :disabled="editDisabled"
                  >{{ t('proto.codeSave') }}</a-button
                ><a-button :disabled="state.locked.value" @click="cancel">{{
                  t('proto.codeCancel')
                }}</a-button>
              </div>
            </form>
            <section v-else class="code-import">
              <h3>
                {{
                  t(
                    state.importResult.value ? 'proto.codeImportResult' : 'proto.codeImportHeading',
                    { page: state.page.value.name },
                  )
                }}
              </h3>
              <template v-if="state.importResult.value">
                <ol class="code-import-results">
                  <li v-for="(item, index) in state.importResult.value.items" :key="item.id">
                    <template v-if="item.card"
                      ><strong>{{ item.card.alias }}</strong
                      ><span class="code-muted">{{ t('proto.codeImportCurrent') }}</span></template
                    ><span v-else>{{ t('proto.codeImportMissing', { index: index + 1 }) }}</span>
                  </li>
                </ol>
                <a-button @click="cancel">{{ t('proto.codeImportDone') }}</a-button>
              </template>
              <template v-else>
                <p>{{ t('proto.codeImportHint') }}</p>
                <input
                  ref="fileInput"
                  type="file"
                  hidden
                  accept=".json,application/json"
                  :disabled="editDisabled"
                  :aria-label="t('proto.codeImportFile')"
                  @change="fileChanged"
                />
                <a-button
                  :disabled="editDisabled"
                  :loading="state.fileReading.value"
                  @click="fileInput?.click()"
                  ><import-outlined aria-hidden="true" />{{ t('proto.codeImportFile') }}</a-button
                >
                <label for="code-import-text">{{ t('proto.codeImportText') }}</label
                ><a-textarea
                  id="code-import-text"
                  :value="state.importText.value"
                  :disabled="editDisabled || state.fileReading.value"
                  :rows="6"
                  class="code-code-input"
                  spellcheck="false"
                  @update:value="state.updateImportText($event)"
                />
                <div class="code-actions">
                  <a-button
                    :disabled="editDisabled || state.fileReading.value || !state.importText.value"
                    @click="state.previewImport"
                    >{{ t('proto.codePreview') }}</a-button
                  ><a-button :disabled="state.locked.value" @click="cancel">{{
                    t('proto.codeCancel')
                  }}</a-button>
                </div>
                <ul v-if="state.importIssues.value.length" class="code-field-error" role="alert">
                  <li v-for="(issue, index) in state.importIssues.value" :key="index">
                    {{ issueText(issue) }}
                  </li>
                </ul>
                <template v-if="state.importCards.value.length">
                  <h4>
                    {{ t('proto.codeImportCount', { count: state.importCards.value.length }) }}
                  </h4>
                  <div class="code-query">
                    <a-input
                      v-model:value="state.descriptionKeyword.value"
                      :aria-label="t('proto.codeSourceSearch')"
                      :placeholder="t('proto.codeSourceSearch')"
                      :maxlength="120"
                      :disabled="editDisabled"
                      @press-enter.prevent="state.loadDescriptions(0)"
                    /><a-button :disabled="editDisabled" @click="state.loadDescriptions(0)">{{
                      t('proto.codeFind')
                    }}</a-button>
                  </div>
                  <a-pagination
                    v-if="state.descriptions.value && state.descriptions.value.total > 20"
                    :current="state.descriptionIndex.value + 1"
                    :total="state.descriptions.value.total"
                    :page-size="20"
                    :show-size-changer="false"
                    simple
                    :disabled="editDisabled"
                    @change="state.loadDescriptions($event - 1)"
                  />
                  <ol class="code-import-preview">
                    <li v-for="(card, index) in state.importCards.value" :key="index">
                      <strong>{{ card.alias }}</strong
                      ><code>{{ card.repositoryPath }}</code>
                      <p v-if="card.framework || card.frameworkVersion">
                        {{ card.framework }} {{ card.frameworkVersion }}
                      </p>
                      <label :for="`code-import-description-${index}`">{{
                        t('proto.codeSource')
                      }}</label
                      ><a-select
                        :id="`code-import-description-${index}`"
                        :value="card.description?.id"
                        :options="sourceOptions"
                        :placeholder="t('proto.codeNoSource')"
                        :get-popup-container="popupContainer"
                        :disabled="editDisabled"
                        :loading="state.descriptionLoading.value"
                        allow-clear
                        @change="chooseDescription($event, index)"
                      />
                      <details>
                        <summary>{{ t('proto.codeImportDetails') }}</summary>
                        <div class="code-links">
                          <a
                            v-for="field in ['repositoryUrl', 'documentationUrl'] as const"
                            v-show="card[field]"
                            :key="field"
                            :href="validLinkUrl(card[field]) ? card[field] : undefined"
                            target="_blank"
                            rel="noopener noreferrer"
                            >{{ t(`proto.${fieldKeys[field]}`) }}</a
                          >
                        </div>
                        <pre tabindex="0">{{ card.snippet || t('proto.codeSnippetEmpty') }}</pre>
                      </details>
                    </li>
                  </ol>
                  <a-button
                    type="primary"
                    :loading="state.busy.value"
                    :disabled="editDisabled || state.fileReading.value"
                    @click="state.importAll"
                    >{{
                      t('proto.codeImportConfirm', { count: state.importCards.value.length })
                    }}</a-button
                  >
                </template>
              </template>
            </section>
            <section
              v-if="state.descriptionDetail.value"
              class="code-source-detail"
              aria-labelledby="code-source-heading"
            >
              <div class="code-detail-heading">
                <h3 id="code-source-heading" tabindex="-1">
                  {{ state.descriptionDetail.value.title }}
                </h3>
                <a-button type="text" @click="state.descriptionDetail.value = undefined">{{
                  t('proto.codeSourceBack')
                }}</a-button>
              </div>
              <dl>
                <template v-for="field in sourceFields" :key="field"
                  ><template v-if="state.descriptionDetail.value[field]"
                    ><dt>{{ t(`proto.${sourceKeys[field]}`) }}</dt>
                    <dd>{{ state.descriptionDetail.value[field] }}</dd></template
                  ></template
                >
              </dl>
              <div class="code-actions">
                <a-button v-if="canLocate && !state.dirty.value" @click="locate"
                  ><aim-outlined aria-hidden="true" />{{ t('proto.codeLocate') }}</a-button
                >
                <a-button
                  v-if="state.canEdit.value && !sourceConfirmed"
                  :disabled="state.locked.value || state.conflict.value"
                  @click="state.useCurrentDescription"
                  >{{ t('proto.codeUseCurrentSource') }}</a-button
                >
              </div>
              <p v-if="!isReviewAnchor(state.descriptionDetail.value.anchor)" class="code-muted">
                {{ t('proto.codeSourceNoArea') }}
              </p>
              <p v-else-if="!sourceConfirmed" class="code-muted">
                {{ t('proto.codeSourceLocateChanged') }}
              </p>
              <p v-if="state.mode.value === 'edit'" class="code-muted">
                {{ t('proto.codeSourceConfirmHint') }}
              </p>
            </section>
          </main>
        </div>
      </section>
    </div>
    <modal-context-holder />
  </teleport>
</template>

<style scoped>
.code-overlay {
  position: fixed;
  inset: 0;
  z-index: 1050;
  padding: 24px;
  background: rgb(16 24 40 / 35%);
  display: flex;
  justify-content: center;
}
.code-workspace {
  width: min(1440px, 100%);
  height: 100%;
  min-width: 0;
  background: var(--color-surface);
  color: var(--color-text);
  display: flex;
  flex-direction: column;
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 20px 50px rgb(16 24 40 / 18%);
}
.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  padding: 22px 24px;
  border-bottom: 1px solid var(--color-border);
}
.code-heading-group {
  min-width: 0;
}
.code-heading-group h1 {
  font-size: 22px;
  line-height: 1.3;
  margin: 0 0 6px;
}
.code-heading-group p {
  margin: 0;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}
.code-heading-group p span {
  padding: 0 8px;
}
.code-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.code-feedback {
  padding: 0 24px;
}
.code-feedback:has(.ant-alert),
.code-feedback:has(p) {
  padding-top: 16px;
}
.code-feedback p {
  margin: 0 0 12px;
}
.code-body {
  display: flex;
  min-height: 0;
  flex: 1;
}
.code-pages {
  flex: 0 0 208px;
  min-width: 0;
  padding: 24px 16px;
  border-right: 1px solid var(--color-border);
  overflow: auto;
}
.code-pages h2 {
  font-size: 14px;
  margin: 0 0 12px;
}
.code-pages nav {
  display: grid;
  gap: 4px;
  margin: 14px 0;
}
.code-pages nav button {
  padding: 12px 10px;
  border: 0;
  border-radius: var(--radius);
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.code-pages nav button span,
.code-pages nav button small {
  display: block;
  overflow-wrap: anywhere;
}
.code-pages nav button small {
  margin-top: 5px;
  color: var(--color-muted);
}
.code-pages nav button[aria-current] {
  background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface));
  color: var(--color-primary);
}
.code-pages nav button:hover {
  background: var(--color-background);
}
.code-scope {
  margin-top: 24px;
  color: var(--color-muted);
  font-size: 12px;
}
.code-scope p {
  overflow-wrap: anywhere;
}
.code-main {
  min-width: 0;
  flex: 1;
  padding: 24px;
  overflow: auto;
  overscroll-behavior: contain;
}
.code-page-heading {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.code-page-heading h2 {
  font-size: 20px;
  margin: 0;
  overflow-wrap: anywhere;
}
.code-path {
  overflow-wrap: anywhere;
  color: var(--color-muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
}
.code-browser {
  display: grid;
  grid-template-columns: minmax(240px, 0.8fr) minmax(0, 1.7fr);
  gap: 28px;
  min-height: 65%;
}
.code-list {
  min-width: 0;
  border-right: 1px solid var(--color-border);
  padding-right: 24px;
}
.code-query {
  display: flex;
  gap: 8px;
  min-width: 0;
  margin-bottom: 14px;
}
.code-query > .ant-input-affix-wrapper,
.code-query > .ant-input {
  min-width: 0;
}
.code-count {
  margin: 0 0 10px;
  color: var(--color-muted);
  font-size: 12px;
}
.code-selection {
  margin-bottom: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.code-rows {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
}
.code-rows > li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 8px;
  border-bottom: 1px solid var(--color-border);
}
.code-rows > li > .ant-checkbox-wrapper {
  margin-top: 4px;
}
.code-row-open {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 7px;
  padding: 0;
  text-align: left;
  border: 0;
  color: var(--color-text);
  background: transparent;
  cursor: pointer;
}
.code-row-open strong {
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.code-row-open small {
  color: var(--color-muted);
  overflow-wrap: anywhere;
}
.code-row-selected {
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
}
.code-row-selected .code-row-open strong {
  color: var(--color-primary);
}
.code-detail {
  min-width: 0;
}
.code-detail-heading,
.code-section-title,
.code-detail-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.code-detail-heading h3 {
  font-size: 22px;
  line-height: 1.4;
  margin: 0;
  overflow-wrap: anywhere;
}
.code-path-box {
  margin: 20px 0 12px;
  padding: 14px;
  border-radius: var(--radius);
  background: var(--color-background);
  overflow-wrap: anywhere;
}
.code-path-box code {
  white-space: pre-wrap;
}
.code-path-box > .ant-btn {
  margin-left: 8px;
}
.code-framework {
  margin: 16px 0;
}
.code-framework,
.code-import-preview p,
.code-server > p {
  overflow-wrap: anywhere;
}
.code-links {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin: 16px 0;
}
.code-links a {
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.code-association {
  padding: 18px 0;
  margin: 18px 0;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  overflow-wrap: anywhere;
}
.code-association .code-actions {
  margin-top: 12px;
}
.code-source-warning,
.code-row-open .code-source-warning {
  color: var(--color-warning-text, #8a4b08);
}
.code-section-title h4 {
  font-size: 14px;
  margin: 0;
}
.code-snippet {
  margin-top: 28px;
}
.code-workspace pre {
  margin: 10px 0 18px;
  padding: 18px;
  max-width: 100%;
  max-height: 420px;
  overflow: auto;
  background: var(--color-background);
  border-radius: var(--radius);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 13px;
  line-height: 1.65;
  tab-size: 2;
  white-space: pre;
}
.code-detail-footer {
  color: var(--color-muted);
  margin-top: 28px;
  font-size: 12px;
}
.code-empty {
  padding: 40px 4px;
  color: var(--color-muted);
}
.code-empty > .anticon {
  font-size: 28px;
  margin-bottom: 18px;
}
.code-empty h3 {
  font-size: 16px;
  color: var(--color-text);
  margin: 0 0 10px;
}
.code-empty p {
  max-width: 28ch;
  margin: 0 0 20px;
}
.code-select-hint {
  padding: 48px 12px;
  text-align: center;
  color: var(--color-muted);
}
.code-editor,
.code-import,
.code-source-detail,
.code-server {
  max-width: 860px;
}
.code-editor h3,
.code-import h3 {
  font-size: 20px;
  margin: 0 0 24px;
}
.code-editor fieldset {
  border: 0;
  padding: 0;
  min-width: 0;
  margin: 0;
}
.code-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.code-field-wide {
  grid-column: 1 / -1;
}
.code-field,
.code-source-picker {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.code-editor fieldset > .code-field,
.code-source-picker {
  margin-top: 24px;
}
.code-code-input {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  tab-size: 2;
}
.code-editor-actions {
  display: flex;
  gap: 12px;
  padding: 24px 0 12px;
}
.code-field-error {
  color: var(--color-danger, #b42318);
  margin: 0;
  font-size: 13px;
}
.code-source-picker > .ant-btn {
  justify-self: start;
}
.code-source-picker .code-query {
  margin-bottom: 0;
}
.code-import > label {
  display: block;
  margin: 24px 0 8px;
}
.code-import > .code-actions {
  margin-top: 12px;
}

.code-import > .code-field-error {
  margin-top: 18px;
  padding-left: 20px;
}
.code-import h4 {
  margin: 30px 0 16px;
  font-size: 18px;
}
.code-import-preview {
  padding-left: 24px;
  margin: 18px 0 24px;
}
.code-import-preview li {
  padding: 20px 0;
  border-bottom: 1px solid var(--color-border);
}
.code-import-preview strong,
.code-import-preview code,
.code-import-preview label {
  display: block;
  overflow-wrap: anywhere;
}
.code-import-preview code {
  margin: 10px 0;
}
.code-import-preview label {
  margin: 18px 0 8px;
}
.code-import-preview .ant-select {
  width: 100%;
}
.code-import-preview details {
  margin-top: 14px;
}
.code-import-results {
  padding-left: 22px;
  margin: 0 0 24px;
}
.code-import-results li {
  padding: 10px 0;
  overflow-wrap: anywhere;
}
.code-import-results strong {
  margin-right: 16px;
}
.code-source-detail,
.code-server {
  margin: 28px 0;
  padding: 24px 0;
  border-top: 1px solid var(--color-border);
}
.code-source-detail dl {
  margin: 24px 0;
}
.code-source-detail dt {
  color: var(--color-muted);
  font-size: 13px;
  margin: 20px 0 7px;
}
.code-source-detail dd {
  white-space: pre-wrap;
  margin: 0;
  max-width: 75ch;
  overflow-wrap: anywhere;
}
.code-server h3 {
  margin: 0 0 16px;
}
.code-muted {
  color: var(--color-muted);
}
.code-workspace summary {
  cursor: pointer;
}
.code-workspace :is(button, input, textarea, a, pre, summary, [tabindex]):focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
.code-workspace ::selection {
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-primary) 22%, var(--color-surface));
}
.code-workspace input,
.code-workspace textarea {
  caret-color: var(--color-primary);
}
.code-mobile-pages,
.code-mobile-back {
  display: none;
}
@media (max-width: 1000px) {
  .code-overlay {
    padding: 0;
  }
  .code-workspace {
    border-radius: 0;
  }
  .code-pages {
    flex-basis: 172px;
  }
  .code-main {
    padding: 20px;
  }
  .code-browser {
    grid-template-columns: minmax(190px, 0.9fr) minmax(0, 1.4fr);
    gap: 20px;
  }
  .code-list {
    padding-right: 18px;
  }
}
@media (max-width: 700px) {
  .code-header {
    gap: 14px;
    padding: 18px 16px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .code-heading-group {
    flex: 1;
  }
  .code-heading-group h1 {
    font-size: 20px;
  }
  .code-heading-group p {
    font-size: 12px;
  }
  .code-actions {
    gap: 8px;
  }
  .code-header > .code-actions {
    width: 100%;
  }
  .code-header > .code-actions > .ant-btn:last-child {
    position: absolute;
    top: 14px;
    right: 10px;
  }
  .code-header > .code-actions > .code-muted {
    margin-left: auto;
  }
  .code-feedback {
    padding: 0 16px;
  }
  .code-main {
    padding: 18px 16px;
  }
  .code-pages {
    flex: 1;
    border-right: 0;
    padding: 20px 16px;
  }
  .code-pages h2 {
    font-size: 18px;
  }
  .code-pages nav button {
    min-height: 56px;
  }
  .code-workspace[data-step='content'] .code-pages,
  .code-workspace[data-step='pages'] .code-main {
    display: none;
  }
  .code-page-heading {
    gap: 8px;
    margin-bottom: 22px;
  }
  .code-page-heading h2 {
    width: 100%;
    font-size: 19px;
  }
  .code-mobile-pages,
  .code-mobile-back {
    display: inline-flex;
    margin-bottom: 8px;
  }
  .code-browser {
    display: block;
  }
  .code-list {
    border: 0;
    padding: 0;
  }
  .code-detail {
    padding-top: 2px;
  }
  .code-workspace[data-pane='list'] .code-detail,
  .code-workspace[data-pane='detail'] .code-list {
    display: none;
  }
  .code-detail-heading h3 {
    font-size: 21px;
  }
  .code-detail-heading {
    align-items: flex-start;
  }
  .code-workspace :is(.ant-btn, input:not([type='checkbox'])) {
    min-height: 44px;
  }
  .code-field-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .code-path-box {
    padding: 12px;
  }
  .code-workspace pre {
    padding: 14px;
  }
  .code-source-picker :deep(.ant-select-selector),
  .code-import-preview :deep(.ant-select-selector) {
    min-height: 44px;
  }
  .code-source-picker :deep(.ant-select-selection-item),
  .code-import-preview :deep(.ant-select-selection-item) {
    line-height: 42px;
  }
}
</style>
