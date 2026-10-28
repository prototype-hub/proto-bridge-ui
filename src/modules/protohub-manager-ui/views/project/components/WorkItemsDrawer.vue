<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, watch } from 'vue'
import {
  Alert as AAlert,
  Button as AButton,
  Drawer as ADrawer,
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  Textarea as ATextarea,
  Modal,
  Pagination as APagination,
  Popconfirm as APopconfirm,
  Select as ASelect,
} from 'ant-design-vue'
import { ExportOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useSession } from '@/app/stores/session'
import type { Project, Revision, Version } from '@/modules/protohub-manager-ui/types'
import {
  safeWorkItemUrl,
  useWorkItems,
} from '@/modules/protohub-manager-ui/views/project/hooks/useWorkItems'
import LoadState from '@/shared/components/LoadState.vue'

const props = defineProps<{ project?: Project; version?: Version; revision?: Revision }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const [modal, ModalContextHolder] = Modal.useModal()
const session = useSession()
const scope = computed(() =>
  props.project && props.version && props.revision && session.user?.id
    ? {
        actorId: session.user.id,
        project: props.project,
        version: props.version,
        revision: props.revision,
      }
    : undefined,
)
const state = useWorkItems(scope)
const open = computed(() => !!props.version && !!props.revision)
function confirmLeave(): Promise<boolean> {
  if (state.busy.value) return Promise.resolve(false)
  if (!state.dirty.value && !state.unknown.value) return Promise.resolve(true)
  return new Promise((resolve) =>
    modal.confirm({
      title: t('proto.workItemLeaveTitle'),
      content: t('proto.workItemLeaveHint'),
      okText: t('proto.workItemLeave'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  )
}
function leave(action: () => void) {
  void confirmLeave().then((allowed) => {
    if (allowed) action()
  })
}
onBeforeRouteLeave(confirmLeave)
onBeforeRouteUpdate(confirmLeave)
function close() {
  leave(() => emit('close'))
}
function selectPage(value: unknown) {
  leave(() => state.selectPage(String(value)))
}
function unload(event: BeforeUnloadEvent) {
  if (state.dirty.value || state.unknown.value || state.busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', unload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', unload))
watch(state.editing, async (editing) => {
  if (editing) {
    await nextTick()
    document.getElementById('work-item-url')?.focus()
  }
})
watch(state.invalid, async (value) => {
  if (value) {
    await nextTick()
    document.getElementById('work-item-url')?.focus()
  }
})
</script>
<template>
  <a-drawer
    :open="open"
    :title="t('proto.workItems')"
    width="min(680px, 100vw)"
    root-class-name="work-items-drawer"
    :closable="!state.busy.value"
    :keyboard="!state.busy.value"
    :mask-closable="!state.busy.value"
    @close="close"
  >
    <section
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.workItems')"
      class="work-items stack"
    >
      <header class="work-item-context">
        <strong>{{ version?.versionName }}</strong>
        <span class="muted"
          >{{ t('proto.workItemFixedRevision') }} ·
          <span translate="no">{{ revision?.id }}</span></span
        >
      </header>
      <label class="work-item-page-label" for="work-item-page">{{ t('proto.workItemPage') }}</label>
      <a-select
        id="work-item-page"
        :value="state.pageId.value || undefined"
        :aria-label="t('proto.workItemPage')"
        :options="state.pages.value"
        :loading="state.pagesLoading.value"
        :disabled="state.busy.value || state.unknown.value || state.editing.value"
        @change="selectPage"
      />
      <details class="work-item-help">
        <summary>{{ t('proto.feedbackHelp') }}</summary>
        <p class="muted">{{ t('proto.workItemHint') }}</p>
      </details>
      <a-alert
        v-if="state.notice.value"
        class="work-item-notice"
        :type="state.unknown.value || state.conflict.value ? 'warning' : 'info'"
        show-icon
        role="status"
        aria-live="polite"
        :message="state.notice.value"
      >
        <template v-if="state.unknown.value" #action
          ><div class="work-item-actions">
            <a-button :disabled="state.busy.value" @click="state.load()">{{
              t('proto.workItemCheck')
            }}</a-button>
            <a-button :loading="state.busy.value" @click="state.retry">{{
              t('proto.workItemRetry')
            }}</a-button
            ><a-button :disabled="state.busy.value" @click="state.discard">{{
              t('proto.workItemDiscard')
            }}</a-button>
          </div></template
        >
        <template v-else-if="state.conflict.value" #action
          ><a-button :disabled="state.busy.value" @click="state.load(true)">{{
            t('proto.workItemRefresh')
          }}</a-button></template
        >
      </a-alert>
      <a-form
        v-if="state.editing.value && state.canEdit.value"
        layout="vertical"
        name="work-item-editor"
        :model="state.form"
        class="work-item-editor"
        @submit.prevent="state.save"
      >
        <h3>{{ t(state.original.value ? 'proto.workItemEdit' : 'proto.workItemAdd') }}</h3>
        <a-form-item
          :label="t('proto.workItemUrl')"
          name="url"
          html-for="work-item-url"
          required
          :validate-status="state.invalid.value ? 'error' : undefined"
          :help="state.invalid.value || t('proto.workItemUrlHint')"
        >
          <a-input
            id="work-item-url"
            :aria-label="t('proto.workItemUrl')"
            v-model:value="state.form.url"
            type="url"
            name="workItemUrl"
            autocomplete="off"
            :spellcheck="false"
            :maxlength="2048"
            :disabled="state.busy.value || state.unknown.value"
            :aria-invalid="!!state.invalid.value"
            placeholder="https://example.com/tasks/123…"
          />
        </a-form-item>
        <a-form-item :label="t('proto.workItemNote')" name="note" html-for="work-item-note">
          <a-textarea
            id="work-item-note"
            :aria-label="t('proto.workItemNote')"
            v-model:value="state.form.note"
            name="workItemNote"
            autocomplete="off"
            :rows="4"
            :maxlength="2000"
            show-count
            :disabled="state.busy.value || state.unknown.value"
          />
        </a-form-item>
        <div class="work-item-actions">
          <a-button
            type="primary"
            html-type="submit"
            :loading="state.busy.value"
            :disabled="state.unknown.value || state.conflict.value"
            >{{ t('common.save') }}</a-button
          >
          <a-button :disabled="state.busy.value || state.unknown.value" @click="state.discard">{{
            t('common.cancel')
          }}</a-button>
        </div>
      </a-form>
      <div class="work-item-list-heading">
        <h3>
          {{ t('proto.workItemList') }}
          <span class="muted">{{ t('proto.listResults', { count: state.total.value }) }}</span>
        </h3>
        <a-button
          v-if="state.canEdit.value && !state.editing.value"
          :aria-label="t('proto.workItemAdd')"
          type="primary"
          :disabled="!state.pageId.value || state.busy.value || state.unknown.value"
          @click="state.edit()"
          ><template #icon><plus-outlined /></template>{{ t('proto.workItemAdd') }}</a-button
        >
      </div>
      <load-state
        :loading="state.loading.value || state.pagesLoading.value"
        :error="state.error.value"
        @retry="state.pages.value.length ? state.load() : state.loadPages()"
      >
        <ul v-if="state.rows.value.length" class="work-item-list">
          <li v-for="row in state.rows.value" :key="row.id" class="work-item-row">
            <a
              v-if="safeWorkItemUrl(row.url)"
              :href="row.url"
              target="_blank"
              rel="noopener noreferrer"
              class="work-item-link"
              >{{ row.url }} <export-outlined aria-hidden="true" /><span class="sr-only">{{
                t('proto.workItemNewWindow')
              }}</span></a
            >
            <span v-else class="work-item-link">{{ row.url }}</span>
            <p v-if="row.note" class="work-item-note">{{ row.note }}</p>
            <div class="work-item-row-footer">
              <span class="muted"
                >{{ t('proto.updatedAt') }} · {{ new Date(row.updatedAt).toLocaleString() }}</span
              >
              <div v-if="state.canEdit.value" class="work-item-actions">
                <a-button
                  size="small"
                  :disabled="state.busy.value || state.unknown.value || state.editing.value"
                  @click="state.edit(row)"
                  >{{ t('common.edit') }}</a-button
                >
                <a-popconfirm
                  :title="t('proto.workItemRemoveConfirm')"
                  :ok-text="t('proto.workItemRemove')"
                  :cancel-text="t('common.cancel')"
                  :disabled="state.busy.value || state.unknown.value || state.editing.value"
                  @confirm="state.remove(row)"
                  ><a-button
                    size="small"
                    danger
                    :disabled="state.busy.value || state.unknown.value || state.editing.value"
                    >{{ t('proto.workItemRemove') }}</a-button
                  ></a-popconfirm
                >
              </div>
            </div>
          </li>
        </ul>
        <div v-else-if="state.pageId.value" class="work-item-empty">
          <strong>{{ t('proto.workItemEmpty') }}</strong>
          <p class="muted">
            {{ t(state.canEdit.value ? 'proto.workItemEmptyEdit' : 'proto.workItemEmptyRead') }}
          </p>
        </div>
      </load-state>
      <a-pagination
        v-if="state.total.value > 20"
        :current="state.pageIndex.value + 1"
        :page-size="20"
        :total="state.total.value"
        :show-size-changer="false"
        :disabled="state.busy.value || state.unknown.value || state.editing.value"
        class="work-item-pagination"
        @change="state.page"
      />
      <a-button class="work-item-close" :disabled="state.busy.value" @click="close">{{
        t('common.close')
      }}</a-button>
    </section>
  </a-drawer>
  <modal-context-holder />
</template>
<style scoped>
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
.work-items {
  min-width: 0;
  overscroll-behavior: contain;
}
.work-item-context {
  display: grid;
  gap: var(--space-2);
  overflow-wrap: anywhere;
}
.work-item-context strong {
  font-size: 18px;
}
.work-item-page-label {
  margin-bottom: calc(-1 * var(--space-3));
}
.work-item-help summary {
  cursor: pointer;
  width: fit-content;
  color: var(--color-muted);
}
.work-item-help summary:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.work-item-help p {
  margin-bottom: 0;
}
.work-item-notice {
  flex-wrap: wrap;
  align-items: flex-start;
}
.work-item-notice :deep(.ant-alert-content) {
  flex: 1;
  min-width: 0;
}
.work-item-notice :deep(.ant-alert-action) {
  flex-basis: 100%;
  margin: var(--space-3) 0 0;
}
.work-item-editor {
  padding: var(--space-4);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
.work-item-editor h3,
.work-item-list-heading h3 {
  margin: 0;
  font-size: 15px;
}
.work-item-editor h3 {
  margin-bottom: var(--space-4);
}
.work-item-list-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.work-item-list-heading .muted {
  font-weight: 400;
  font-size: var(--text-small);
}
.work-item-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.work-item-row {
  padding-block: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.work-item-link {
  overflow-wrap: anywhere;
  text-underline-offset: 3px;
}
.work-item-note {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin-block: var(--space-3);
}
.work-item-row-footer,
.work-item-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.work-item-row-footer {
  justify-content: space-between;
  margin-top: var(--space-3);
}
.work-item-row-footer > .muted {
  font-size: var(--text-small);
  font-variant-numeric: tabular-nums;
}
.work-item-empty {
  text-align: center;
  padding: var(--space-6) var(--space-4);
}
.work-item-empty p {
  margin: var(--space-2) 0 0;
}
.work-item-pagination {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.work-item-close {
  align-self: flex-start;
}
</style>
