<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import {
  Alert as AAlert,
  Button as AButton,
  Drawer as ADrawer,
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  Textarea as ATextarea,
  Select as ASelect,
  Tag as ATag,
  Pagination as APagination,
  Popconfirm as APopconfirm,
  Dropdown as ADropdown,
  Menu as AMenu,
  MenuItem as AMenuItem,
  Modal,
} from 'ant-design-vue'
import { DownOutlined, ExportOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { useSession } from '@/app/stores/session'
import LoadState from '@/shared/components/LoadState.vue'
import type { CopyInventoryEntry } from '../types/copy-inventory'
import type { Project, Revision, ReviewPage } from '../types'
import { useCopyInventory } from '../hooks/useCopyInventory'
import { safeWorkItemUrl } from '../views/project/hooks/useWorkItems'

const props = defineProps<{ project?: Project; revision?: Revision; initialPage?: ReviewPage }>()
const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
const [modal, ModalContextHolder] = Modal.useModal()
const session = useSession()
const scope = computed(() =>
  props.project && props.revision && session.user?.id
    ? {
        actorId: session.user.id,
        project: props.project,
        revision: props.revision,
        initialPage: props.initialPage,
      }
    : undefined,
)
const state = useCopyInventory(scope)
const workspaceRoot = ref<HTMLElement>()
let editorTrigger: HTMLElement | undefined
const exportTrigger = ref<{ $el: HTMLElement }>()
function startEdit(row: CopyInventoryEntry | undefined, event: MouseEvent) {
  editorTrigger = event.currentTarget as HTMLElement
  state.edit(row)
}
async function filter(clear = false) {
  state.query(clear)
  if (clear) {
    await nextTick()
    document.getElementById('copy-search')?.focus()
  }
}
async function exportFile(format: 'csv' | 'json') {
  await state.exportInventory(format)
  await nextTick()
  exportTrigger.value?.$el.focus()
}
const rows = computed(() => state.result.value?.data || [])
const pageOptions = computed(() =>
  state.pages.value.map((page) => ({ value: page.pageId, label: `${page.name} · ${page.path}` })),
)
const editorDisabled = computed(() => state.locked.value || state.conflict.value)
const sourceManual = computed(() => state.original.value?.kind !== 'STATIC')
const noMatches = computed(
  () =>
    state.filtered.value ||
    (state.result.value?.total === 0 && !!state.snapshot.value?.staticCount),
)
function confirmLeave(): Promise<boolean> {
  if (state.busy.value || state.unknown.value) return Promise.resolve(false)
  if (!state.dirty.value && !state.unknown.value) return Promise.resolve(true)
  return new Promise((resolve) =>
    modal.confirm({
      title: t('proto.copyLeaveTitle'),
      content: t('proto.copyLeaveHint'),
      okText: t('proto.copyLeave'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  )
}
async function close() {
  if (await confirmLeave()) {
    state.cancelExport()
    emit('close')
  }
}
async function selectPage(value: unknown) {
  if (await confirmLeave()) {
    state.discard()
    state.selectPage(String(value))
  }
}
async function discard() {
  if (await confirmLeave()) state.discard()
}
onBeforeRouteLeave(confirmLeave)
onBeforeRouteUpdate(confirmLeave)
function unload(event: BeforeUnloadEvent) {
  if (state.dirty.value || state.unknown.value || state.busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', unload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', unload))
watch(state.editing, async (value) => {
  if (value) {
    await nextTick()
    document.getElementById(sourceManual.value ? 'copy-text' : 'copy-term')?.focus()
  } else {
    await nextTick()
    if (editorTrigger?.isConnected) editorTrigger.focus()
    else document.getElementById('copy-add')?.focus()
  }
})
watch(state.error, async (error) => {
  if (!error) return
  await nextTick()
  if (error === state.error.value && document.activeElement === document.body)
    workspaceRoot.value?.querySelector<HTMLButtonElement>('.ant-result-extra button')?.focus()
})
async function save() {
  state.save()
  await nextTick()
  const key = Object.entries(state.invalid).find(([, value]) => value)?.[0]
  if (key)
    document
      .getElementById(
        (
          {
            text: 'copy-text',
            businessTerm: 'copy-term',
            note: 'copy-note',
            requirementUrl: 'copy-url',
          } as Record<string, string>
        )[key]!,
      )
      ?.focus()
}
function date(value: number) {
  return new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}
</script>
<template>
  <a-drawer
    :open="!!revision && !!project"
    width="min(1120px, 100vw)"
    root-class-name="copy-inventory-drawer"
    :closable="!state.busy.value && !state.unknown.value"
    :keyboard="!state.busy.value && !state.unknown.value"
    :mask-closable="!state.busy.value && !state.unknown.value"
    @close="close"
  >
    <template #title
      ><span
        >{{ t('proto.copyInventory')
        }}<span v-if="state.page.value" class="copy-title-page">
          · {{ state.page.value.name }}</span
        ></span
      ></template
    >
    <section
      ref="workspaceRoot"
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.copyInventory')"
      class="copy-workspace"
      :class="{ 'copy-is-editing': state.editing.value }"
    >
      <header class="copy-context">
        <div>
          <h2>
            {{ project?.name }} <span>{{ revision?.versionName }}</span>
          </h2>
          <p class="muted" translate="no">{{ t('proto.copyScope', { revision: revision?.id }) }}</p>
        </div>
        <div class="copy-page">
          <label for="copy-page">{{ t('proto.copyPage') }}</label
          ><a-select
            id="copy-page"
            :aria-label="t('proto.copyPage')"
            :value="state.pageId.value || undefined"
            :options="pageOptions"
            :loading="state.pagesLoading.value"
            :disabled="state.locked.value"
            @change="selectPage"
          />
        </div>
      </header>
      <p
        v-if="state.notice.value && !state.unknown.value && !state.conflict.value"
        class="copy-status"
        role="status"
        aria-live="polite"
      >
        {{ state.notice.value }}
      </p>
      <a-alert
        v-if="state.notice.value && (state.unknown.value || state.conflict.value)"
        :message="state.notice.value"
        :type="state.unknown.value || state.conflict.value ? 'warning' : 'info'"
        role="status"
        aria-live="polite"
        show-icon
        class="copy-notice"
      >
        <template v-if="state.unknown.value || state.conflict.value" #action
          ><div class="copy-actions">
            <a-button :disabled="state.busy.value" @click="state.load">{{
              t('proto.copyCheck')
            }}</a-button
            ><a-button
              v-if="state.unknown.value"
              :loading="state.busy.value"
              @click="state.retry"
              >{{ t('proto.copyRetry') }}</a-button
            ><a-button v-else :disabled="state.busy.value" @click="discard">{{
              t('proto.copyReloadDiscard')
            }}</a-button>
          </div></template
        >
      </a-alert>
      <load-state
        :loading="state.pagesLoading.value || (state.loading.value && !state.result.value)"
        :error="state.error.value"
        @retry="state.pages.value.length ? state.load() : state.loadPages()"
      >
        <template v-if="state.snapshot.value">
          <div v-if="!state.extracted.value" class="copy-start">
            <h2>{{ t('proto.copyNotExtracted') }}</h2>
            <p>
              {{
                t(state.canEdit.value ? 'proto.copyNotExtractedHint' : 'proto.copyWaitExtraction')
              }}
            </p>
            <a-button
              v-if="state.canEdit.value"
              type="primary"
              :loading="state.busy.value"
              :disabled="state.unknown.value"
              @click="state.extract"
              >{{ t('proto.copyExtract') }}</a-button
            >
          </div>
          <template v-else>
            <section class="copy-summary">
              <div class="copy-summary-line">
                <strong>{{
                  t('proto.copyCounts', {
                    static: state.snapshot.value.staticCount,
                    manual: state.snapshot.value.manualCount,
                  })
                }}</strong
                ><span v-if="state.snapshot.value.extractedAt" class="muted">{{
                  date(state.snapshot.value.extractedAt)
                }}</span>
              </div>
              <p>{{ t('proto.copyDynamicGap') }}</p>
              <a-alert
                v-if="state.snapshot.value.extractionState === 'LIMIT_EXCEEDED'"
                type="warning"
                show-icon
                :message="
                  t('proto.copyExtractionLimit', {
                    reason: t(`proto.copyLimit${state.snapshot.value.limitReason}`),
                  })
                "
              />
              <p v-else-if="state.snapshot.value.extractionState === 'EMPTY'" class="muted">
                {{ t('proto.copyExtractionEmpty') }}
              </p>
            </section>
            <div class="copy-layout">
              <section class="copy-review">
                <a-form
                  layout="vertical"
                  class="copy-filters"
                  name="copy-filter"
                  @submit.prevent="filter()"
                >
                  <a-form-item :label="t('proto.copySearch')" html-for="copy-search"
                    ><a-input
                      id="copy-search"
                      v-model:value="state.filters.keyword"
                      name="copyKeyword"
                      autocomplete="off"
                      :maxlength="100"
                      :disabled="state.locked.value || state.editing.value"
                      allow-clear
                  /></a-form-item>
                  <a-form-item :label="t('proto.copyKind')" html-for="copy-kind"
                    ><a-select
                      id="copy-kind"
                      v-model:value="state.filters.kind"
                      :disabled="state.locked.value || state.editing.value"
                      :options="[
                        { value: '', label: t('proto.copyAllKinds') },
                        { value: 'STATIC', label: t('proto.copyStatic') },
                        { value: 'MANUAL', label: t('proto.copyManual') },
                      ]"
                  /></a-form-item>
                  <a-form-item :label="t('proto.copyRequirementFilter')" html-for="copy-requirement"
                    ><a-select
                      id="copy-requirement"
                      v-model:value="state.filters.requirement"
                      :disabled="state.locked.value || state.editing.value"
                      :options="[
                        { value: '', label: t('proto.copyAllRequirements') },
                        { value: 'yes', label: t('proto.copyHasRequirement') },
                        { value: 'no', label: t('proto.copyNoRequirement') },
                      ]"
                  /></a-form-item>
                  <div class="copy-actions">
                    <a-button
                      html-type="submit"
                      :loading="state.loading.value"
                      :disabled="state.locked.value || state.editing.value"
                      >{{ t('proto.copyFilter') }}</a-button
                    ><a-button
                      v-if="state.filtered.value"
                      type="text"
                      :disabled="state.locked.value || state.editing.value"
                      @click="filter(true)"
                      >{{ t('proto.copyClearFilter') }}</a-button
                    >
                  </div>
                </a-form>
                <div class="copy-list-heading">
                  <h3>
                    {{ t('proto.copyInventory') }}
                    <span class="muted" aria-live="polite">{{
                      t('proto.copyMatches', { count: state.result.value?.total || 0 })
                    }}</span>
                  </h3>
                  <a-button
                    v-if="state.canEdit.value && !state.editing.value"
                    id="copy-add"
                    type="primary"
                    :disabled="state.locked.value || state.loading.value"
                    @click="startEdit(undefined, $event)"
                    ><template #icon><plus-outlined aria-hidden="true" /></template
                    >{{ t('proto.copyAdd') }}</a-button
                  >
                </div>
                <ul v-if="rows.length" class="copy-list" :aria-busy="state.loading.value">
                  <li v-for="row in rows" :key="row.id" class="copy-row">
                    <div class="copy-row-heading">
                      <a-tag :color="row.kind === 'STATIC' ? 'blue' : undefined">{{
                        t(row.kind === 'STATIC' ? 'proto.copyStatic' : 'proto.copyManual')
                      }}</a-tag
                      ><span v-if="row.kind === 'STATIC'" class="muted">{{
                        t('proto.copyOccurrences', { count: row.occurrenceCount })
                      }}</span>
                    </div>
                    <p class="copy-row-text">{{ row.text }}</p>
                    <dl v-if="row.businessTerm || row.note" class="copy-metadata">
                      <template v-if="row.businessTerm"
                        ><dt>{{ t('proto.copyBusinessTerm') }}</dt>
                        <dd>{{ row.businessTerm }}</dd></template
                      ><template v-if="row.note"
                        ><dt>{{ t('proto.copyNote') }}</dt>
                        <dd>{{ row.note }}</dd></template
                      >
                    </dl>
                    <a
                      v-if="row.requirementUrl && safeWorkItemUrl(row.requirementUrl)"
                      :href="row.requirementUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="copy-requirement-link"
                      >{{ row.requirementUrl }} <export-outlined aria-hidden="true" /><span
                        class="sr-only"
                        >{{ t('proto.workItemNewWindow') }}</span
                      ></a
                    >
                    <div class="copy-row-footer">
                      <details class="copy-source">
                        <summary>{{ t('proto.copySource') }}</summary>
                        <p class="copy-full-text">{{ row.text }}</p>
                        <ol v-if="row.occurrences.length">
                          <li v-for="occurrence in row.occurrences" :key="occurrence.ordinal">
                            {{ occurrence.ordinal }} ·
                            {{ t(`proto.copySource${occurrence.sourceKind}`) }}
                          </li>
                        </ol>
                      </details>
                      <div v-if="state.canEdit.value" class="copy-actions">
                        <a-button
                          size="small"
                          :disabled="
                            state.locked.value || state.editing.value || state.loading.value
                          "
                          @click="startEdit(row, $event)"
                          >{{ t('proto.copyEdit') }}</a-button
                        ><a-popconfirm
                          v-if="row.kind === 'MANUAL'"
                          :title="t('proto.copyDeleteConfirm')"
                          :ok-text="t('common.delete')"
                          :cancel-text="t('common.cancel')"
                          @confirm="state.remove(row)"
                          ><a-button
                            size="small"
                            danger
                            :disabled="state.locked.value || state.editing.value"
                            >{{ t('common.delete') }}</a-button
                          ></a-popconfirm
                        >
                      </div>
                    </div>
                  </li>
                </ul>
                <div v-else class="copy-empty">
                  <h3>{{ t(noMatches ? 'proto.copyNoMatches' : 'proto.copyEmpty') }}</h3>
                  <p class="muted">
                    {{ t(noMatches ? 'proto.copyNoMatchesHint' : 'proto.copyEmptyHint') }}
                  </p>
                </div>
                <a-pagination
                  v-if="(state.result.value?.total || 0) > 20"
                  class="copy-pagination"
                  :current="state.pageIndex.value + 1"
                  :page-size="20"
                  :total="state.result.value?.total"
                  :show-size-changer="false"
                  :disabled="state.locked.value || state.editing.value"
                  @change="state.paginate"
                />
              </section>
              <a-form
                v-if="state.editing.value"
                class="copy-editor"
                layout="vertical"
                name="copy-editor"
                :model="state.form"
                @submit.prevent="save"
              >
                <h3>{{ t(state.original.value ? 'proto.copyEdit' : 'proto.copyAdd') }}</h3>
                <template v-if="!sourceManual"
                  ><p class="muted">{{ t('proto.copyStaticReadonly') }}</p>
                  <p class="copy-static-text">{{ state.form.text }}</p></template
                >
                <a-form-item
                  v-else
                  :label="t('proto.copyText')"
                  html-for="copy-text"
                  required
                  :validate-status="state.invalid.text ? 'error' : undefined"
                  :help="state.invalid.text"
                  ><a-textarea
                    id="copy-text"
                    v-model:value="state.form.text"
                    name="copyText"
                    autocomplete="off"
                    :rows="4"
                    :maxlength="2000"
                    show-count
                    :disabled="editorDisabled"
                    :aria-invalid="!!state.invalid.text"
                /></a-form-item>
                <a-form-item
                  :label="t('proto.copyBusinessTerm')"
                  html-for="copy-term"
                  :validate-status="state.invalid.businessTerm ? 'error' : undefined"
                  :help="state.invalid.businessTerm"
                  ><a-input
                    id="copy-term"
                    v-model:value="state.form.businessTerm"
                    name="copyBusinessTerm"
                    autocomplete="off"
                    :maxlength="200"
                    :disabled="editorDisabled"
                /></a-form-item>
                <a-form-item
                  :label="t('proto.copyNote')"
                  html-for="copy-note"
                  :validate-status="state.invalid.note ? 'error' : undefined"
                  :help="state.invalid.note"
                  ><a-textarea
                    id="copy-note"
                    v-model:value="state.form.note"
                    name="copyNote"
                    autocomplete="off"
                    :rows="3"
                    :maxlength="2000"
                    :disabled="editorDisabled"
                /></a-form-item>
                <a-form-item
                  :label="t('proto.copyRequirementUrl')"
                  html-for="copy-url"
                  :validate-status="state.invalid.requirementUrl ? 'error' : undefined"
                  :help="state.invalid.requirementUrl || t('proto.copyRequirementUrlHint')"
                  ><a-input
                    id="copy-url"
                    v-model:value="state.form.requirementUrl"
                    type="url"
                    name="copyRequirementUrl"
                    autocomplete="off"
                    :spellcheck="false"
                    :maxlength="2048"
                    placeholder="https://example.com/requirements/123…"
                    :disabled="editorDisabled"
                    :aria-invalid="!!state.invalid.requirementUrl"
                /></a-form-item>
                <div class="copy-actions">
                  <a-button
                    type="primary"
                    html-type="submit"
                    :loading="state.busy.value"
                    :disabled="editorDisabled"
                    >{{ t('proto.copySave') }}</a-button
                  ><a-button :disabled="state.busy.value || state.unknown.value" @click="discard">{{
                    t('common.cancel')
                  }}</a-button>
                </div>
              </a-form>
            </div>
          </template>
          <details class="copy-help">
            <summary>{{ t('proto.copyMethod') }}</summary>
            <p>{{ t('proto.copyMethodHint') }}</p>
            <p>{{ t('proto.copyExportScope') }}</p>
            <dl v-if="state.extracted.value">
              <dt>{{ t('proto.revision') }}</dt>
              <dd translate="no">{{ state.snapshot.value.revisionId }}</dd>
              <dt>{{ t('proto.copyPage') }}</dt>
              <dd translate="no">{{ state.snapshot.value.pagePath }}</dd>
              <dt>SHA-256</dt>
              <dd translate="no">{{ state.snapshot.value.fileSha256 }}</dd>
            </dl>
          </details>
          <footer class="copy-footer">
            <div v-if="!state.editing.value" class="copy-export">
              <a-dropdown
                v-if="state.extracted.value"
                :trigger="['click']"
                :disabled="state.locked.value || state.editing.value"
                ><a-button ref="exportTrigger" :disabled="state.locked.value || state.editing.value"
                  >{{ t('proto.copyExport') }} <down-outlined aria-hidden="true" /></a-button
                ><template #overlay
                  ><a-menu
                    ><a-menu-item key="csv" @click="exportFile('csv')">{{
                      t('proto.copyExportCsv')
                    }}</a-menu-item
                    ><a-menu-item key="json" @click="exportFile('json')">{{
                      t('proto.copyExportJson')
                    }}</a-menu-item></a-menu
                  ></template
                ></a-dropdown
              ><span v-if="state.extracted.value" class="muted">{{
                t('proto.copyExportScope')
              }}</span>
            </div>
            <a-button :disabled="state.busy.value || state.unknown.value" @click="close">{{
              t('common.close')
            }}</a-button>
          </footer>
          <div v-if="state.exporting.value" class="copy-actions" role="status">
            <span>{{ t('proto.copyExportBusy') }}</span
            ><a-button @click="state.cancelExport">{{ t('proto.copyCancelExport') }}</a-button>
          </div>
          <a-alert
            v-if="state.exportError.value"
            type="error"
            :message="state.exportError.value"
            role="alert"
            show-icon
          />
        </template>
      </load-state>
    </section>
  </a-drawer>
  <modal-context-holder />
</template>
<style scoped>
.copy-title-page {
  color: var(--color-muted);
  font-size: var(--text-body);
  font-weight: 400;
  overflow-wrap: anywhere;
}
.copy-workspace {
  display: grid;
  gap: var(--space-6);
  min-width: 0;
  overscroll-behavior: contain;
}
.copy-context {
  display: grid;
  grid-template-columns: 1fr minmax(240px, 40%);
  gap: var(--space-6);
  align-items: end;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--space-4);
}
.copy-context h2 {
  font-size: 18px;
  margin: 0 0 var(--space-2);
  overflow-wrap: anywhere;
}
.copy-context h2 span {
  font-size: var(--text-body);
  font-weight: 400;
  color: var(--color-muted);
  margin-left: var(--space-2);
}
.copy-context p {
  margin: 0;
  overflow-wrap: anywhere;
}
.copy-page {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.copy-page .ant-select {
  width: 100%;
  min-width: 0;
}
.copy-status {
  margin: 0;
  color: var(--color-muted);
}
.copy-summary {
  display: grid;
  gap: var(--space-2);
}
.copy-summary-line {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  align-items: baseline;
}
.copy-summary p {
  margin: 0;
  max-width: 75ch;
}
.copy-summary-line strong {
  font-size: 16px;
}
.copy-start {
  padding: var(--space-8) 0;
  max-width: 65ch;
}
.copy-start h2 {
  margin: 0 0 var(--space-3);
  font-size: var(--text-title);
}
.copy-start p {
  margin: 0 0 var(--space-6);
  line-height: 1.6;
}
.copy-layout {
  display: grid;
  gap: var(--space-6);
  min-width: 0;
}
.copy-is-editing .copy-filters {
  display: none;
}
.copy-is-editing .copy-layout {
  grid-template-columns: minmax(0, 1fr) minmax(300px, 38%);
}
.copy-review {
  min-width: 0;
}
.copy-filters {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(130px, 0.6fr) minmax(150px, 0.7fr);
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-background);
  border-radius: var(--radius);
  margin-bottom: var(--space-6);
}
.copy-filters .ant-form-item {
  margin: 0;
  min-width: 0;
}
.copy-filters > .copy-actions {
  grid-column: 1 / -1;
}
.copy-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
.copy-list-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-3);
  align-items: center;
  margin-bottom: var(--space-2);
}
.copy-list-heading h3 {
  margin: 0;
  font-size: 16px;
}
.copy-list-heading h3 span {
  font-size: var(--text-body);
  font-weight: 400;
  margin-left: var(--space-2);
}
.copy-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.copy-row {
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--color-border);
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
.copy-row-heading,
.copy-row-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  justify-content: space-between;
}
.copy-row-heading {
  justify-content: flex-start;
}
.copy-row-text {
  font-size: 16px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}
.copy-metadata {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2) var(--space-3);
  margin: 0;
}
.copy-metadata dt {
  color: var(--color-muted);
}
.copy-metadata dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.copy-requirement-link {
  overflow-wrap: anywhere;
  text-underline-offset: 3px;
}
.copy-source {
  min-width: 0;
  max-width: 100%;
}
.copy-source summary,
.copy-help summary {
  cursor: pointer;
  color: var(--color-muted);
  width: fit-content;
}
.copy-source ol {
  padding-left: var(--space-6);
  max-height: 240px;
  overflow: auto;
}
.copy-full-text,
.copy-static-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
  max-height: 300px;
  overflow: auto;
}
.copy-editor {
  min-width: 0;
  border-left: 1px solid var(--color-border);
  padding-left: var(--space-6);
}
.copy-editor h3 {
  font-size: 18px;
  margin: 0 0 var(--space-4);
}
.copy-editor .ant-form-item {
  margin-bottom: var(--space-6);
}
.copy-empty {
  text-align: center;
  padding: var(--space-8) var(--space-4);
}
.copy-empty h3 {
  font-size: 16px;
}
.copy-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-4);
  font-variant-numeric: tabular-nums;
}
.copy-help {
  margin-top: var(--space-6);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-4);
}
.copy-help p,
.copy-help dd {
  max-width: 75ch;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.copy-help dd {
  margin-left: 0;
  color: var(--color-muted);
}
.copy-footer {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  margin-top: var(--space-6);
  align-items: flex-start;
}
.copy-export {
  display: grid;
  gap: var(--space-2);
  max-width: 65ch;
}
.copy-export > .ant-btn {
  justify-self: start;
}
.copy-notice :deep(.ant-alert-content) {
  min-width: 0;
}
.copy-notice :deep(.ant-alert) {
  flex-wrap: wrap;
}
.copy-notice :deep(.ant-alert-action) {
  margin: 0;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 760px) {
  .copy-context {
    grid-template-columns: 1fr;
    gap: var(--space-4);
  }
  .copy-filters {
    grid-template-columns: 1fr 1fr;
    padding: var(--space-3);
  }
  .copy-filters > .ant-form-item:first-child {
    grid-column: 1 / -1;
  }
  .copy-is-editing .copy-layout {
    grid-template-columns: 1fr;
  }
  .copy-is-editing .copy-review {
    display: none;
  }
  .copy-editor {
    border: 0;
    padding: 0;
  }
  .copy-notice {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .copy-footer {
    flex-wrap: wrap;
  }
  .copy-footer > .ant-btn {
    width: 100%;
  }
}
</style>
