<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  Alert as AAlert,
  Button as AButton,
  Textarea as ATextarea,
  Pagination as APagination,
  Modal,
} from 'ant-design-vue'
import { RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ExportOutlined } from '@ant-design/icons-vue'
import { useSession } from '@/app/stores/session'
import LoadState from '@/shared/components/LoadState.vue'
import type { Project, Revision } from '../types'
import type { ApprovalAction, ApprovalEvent } from '../types/revision-approval'
import { useRevisionApproval } from '../hooks/useRevisionApproval'
const props = defineProps<{ project?: Project; revision?: Revision }>()
const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n(),
  session = useSession()
const scope = computed(() =>
  props.project && props.revision && session.user?.id
    ? { project: props.project, revision: props.revision, actorId: session.user.id }
    : undefined,
)
const state = useRevisionApproval(scope)
const [modal, ModalContextHolder] = Modal.useModal()
function time(value: number) {
  return new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}
const snapshot = ref<ApprovalEvent>(),
  snapshotHeading = ref<HTMLElement>()
let confirmation: ReturnType<typeof modal.confirm> | undefined
const confirming = ref(false)
const blocked = computed(() => state.busy.value || state.unknown.value)
const disabled = computed(
  () => blocked.value || state.loading.value || state.conflict.value || confirming.value,
)
function confirmAction(action: ApprovalAction) {
  const selected = state.current.value
  if (!selected || disabled.value || !state.canEdit.value) return
  confirming.value = true
  confirmation = modal.confirm({
    title: t(`proto.approvalConfirm_${action}`),
    content: h('div', { style: { overflowWrap: 'anywhere' } }, [
      h('p', `${selected.revision.versionName} · ${selected.revisionId}`),
      h('p', t(`proto.approvalConfirmHint_${action}`)),
    ]),
    okText: t(`proto.approvalAction_${action}`),
    cancelText: t('common.cancel'),
    autoFocusButton: 'cancel',
    afterClose: () => {
      confirming.value = false
    },
    okButtonProps: { danger: action === 'revoke' || action === 'withdraw' },
    onOk: () => {
      if (state.current.value === selected && state.canEdit.value) return state.act(action)
    },
  })
}
function canLeave(): Promise<boolean> {
  if (blocked.value) return Promise.resolve(false)
  if (!state.note.value) return Promise.resolve(true)
  return new Promise((resolve) =>
    modal.confirm({
      title: t('proto.approvalLeaveTitle'),
      content: t('proto.approvalLeaveHint'),
      okText: t('proto.approvalLeave'),
      cancelText: t('common.cancel'),
      autoFocusButton: 'cancel',
      okButtonProps: { danger: true },
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  )
}
async function close() {
  if (await canLeave()) emit('close')
}
function showSnapshot(row: ApprovalEvent) {
  snapshot.value = row
  void nextTick(() => snapshotHeading.value?.focus())
}
function back() {
  snapshot.value = undefined
  void nextTick(() => document.querySelector<HTMLElement>('.approval-history summary')?.focus())
}
watch(state.current, (value) => {
  if (!value) {
    snapshot.value = undefined
    confirmation?.destroy()
  }
})
onBeforeRouteLeave(canLeave)
onBeforeRouteUpdate((to, from) =>
  to.params.projectId === from.params.projectId &&
  to.params.versionId === from.params.versionId &&
  to.query.revisionId === from.query.revisionId
    ? true
    : canLeave(),
)
function unload(event: BeforeUnloadEvent) {
  if (state.note.value || blocked.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', unload)
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', unload)
  confirmation?.destroy()
})
defineExpose({ canLeave, blocked })
</script>
<template>
  <section
    class="approval-panel stack"
    role="dialog"
    aria-modal="true"
    :aria-label="t('proto.approvalTitle')"
  >
    <header class="approval-heading">
      <div>
        <h2>{{ revision?.versionName }}</h2>
        <p class="muted">
          {{ t('proto.approvalFixed') }} · <span translate="no">{{ revision?.id }}</span>
        </p>
      </div>
      <a-button :disabled="blocked" @click="close">{{ t('common.close') }}</a-button>
    </header>
    <a-alert
      v-if="state.notice.value"
      :type="state.unknown.value || state.conflict.value ? 'warning' : 'info'"
      show-icon
      role="status"
      aria-live="polite"
      :message="state.notice.value"
    >
      <template v-if="state.unknown.value || state.conflict.value" #description>
        <div class="approval-actions">
          <a-button
            :loading="state.loading.value"
            :disabled="state.busy.value"
            @click="state.load()"
            >{{
              t(state.conflict.value ? 'proto.approvalRefresh' : 'proto.approvalCheck')
            }}</a-button
          >
          <a-button
            v-if="state.unknown.value"
            type="primary"
            :loading="state.busy.value"
            :disabled="state.loading.value"
            @click="state.retry"
            >{{ t('proto.approvalRetry') }}</a-button
          >
        </div>
      </template>
    </a-alert>
    <load-state :loading="state.loading.value" :error="state.error.value" @retry="state.load()">
      <template v-if="state.current.value">
        <div class="approval-status" aria-live="polite">
          <section>
            <h3>
              {{
                t(state.current.value.approved ? 'proto.approvalApproved' : 'proto.approvalPending')
              }}
            </h3>
            <p v-if="state.current.value.approval" class="muted">
              {{ state.current.value.approval.actorName }} ·
              {{ time(state.current.value.approval.createTime) }}
            </p>
          </section>
          <section>
            <h3>
              {{
                t(
                  state.current.value.published
                    ? 'proto.approvalPublished'
                    : 'proto.approvalUnpublished',
                )
              }}
            </h3>
            <p v-if="state.current.value.publication" class="muted">
              {{ state.current.value.publication.actorName }} ·
              {{ time(state.current.value.publication.createTime) }}
            </p>
          </section>
        </div>
        <section v-if="snapshot" class="approval-snapshot stack">
          <h3 ref="snapshotHeading" tabindex="-1">{{ t('proto.approvalSnapshotTitle') }}</h3>
          <p>{{ snapshot.actorName }} · {{ time(snapshot.createTime) }}</p>
          <p v-if="snapshot.note" class="approval-note">{{ snapshot.note }}</p>
          <p class="muted">{{ t('proto.approvalSnapshotHint') }}</p>
          <p v-if="state.current.value.revision.description">
            {{ state.current.value.revision.description }}
          </p>
          <dl class="approval-metadata">
            <dt>{{ t('proto.approvalEntry') }}</dt>
            <dd translate="no">{{ state.current.value.revision.entryFile }}</dd>
            <dt>{{ t('proto.approvalDigest') }}</dt>
            <dd translate="no">{{ state.current.value.revision.manifestSha256 }}</dd>
            <dt>{{ t('proto.approvalCreated') }}</dt>
            <dd>{{ time(state.current.value.revision.createTime) }}</dd>
          </dl>
          <p>
            {{
              t('proto.approvalFiles', {
                count: state.current.value.revision.fileCount,
                bytes: state.current.value.revision.totalBytes,
              })
            }}
          </p>
          <div class="approval-actions">
            <router-link
              :to="{
                name: 'PrototypeHub-preview-window',
                params: {
                  projectId: state.current.value.projectId,
                  versionId: state.current.value.versionId,
                },
                query: { revisionId: state.current.value.revisionId },
              }"
              target="_blank"
              rel="noopener"
              >{{ t('proto.approvalOpenExact') }}
              <export-outlined aria-hidden="true" /></router-link
            ><a-button @click="back">{{ t('proto.approvalBack') }}</a-button>
          </div>
        </section>
        <template v-else>
          <section v-if="state.canEdit.value" class="approval-editor stack">
            <label for="approval-note">{{ t('proto.approvalNote') }}</label>
            <a-textarea
              id="approval-note"
              v-model:value="state.note.value"
              name="approval-note"
              autocomplete="off"
              :rows="3"
              :maxlength="2000"
              show-count
              :disabled="blocked"
              :aria-invalid="!!state.invalid.value"
              :aria-describedby="state.invalid.value ? 'approval-invalid' : undefined"
            />
            <p v-if="state.invalid.value" id="approval-invalid" role="alert">
              {{ state.invalid.value }}
            </p>
            <div class="approval-actions">
              <a-button
                v-if="!state.current.value.approved"
                type="primary"
                :disabled="disabled"
                :loading="state.busy.value"
                @click="confirmAction('approve')"
                >{{ t('proto.approvalAction_approve') }}</a-button
              >
              <a-button
                v-if="state.current.value.approved && !state.current.value.published"
                type="primary"
                :disabled="disabled"
                :loading="state.busy.value"
                @click="confirmAction('publish')"
                >{{ t('proto.approvalAction_publish') }}</a-button
              >
              <a-button
                v-if="state.current.value.published"
                danger
                :disabled="disabled"
                @click="confirmAction('withdraw')"
                >{{ t('proto.approvalAction_withdraw') }}</a-button
              >
              <a-button
                v-if="state.current.value.approved"
                danger
                type="text"
                :disabled="disabled"
                @click="confirmAction('revoke')"
                >{{ t('proto.approvalAction_revoke') }}</a-button
              >
            </div>
          </section>
          <p v-else class="muted">{{ t('proto.approvalReadOnly') }}</p>
          <details
            class="approval-history"
            @toggle="state.historyOpen.value = ($event.target as HTMLDetailsElement).open"
          >
            <summary>{{ t('proto.approvalHistory') }}</summary>
            <load-state
              :loading="state.historyLoading.value"
              :error="state.historyError.value"
              @retry="state.loadHistory"
            >
              <p v-if="!state.rows.value.length" class="muted">{{ t('proto.approvalEmpty') }}</p>
              <ol v-else class="approval-events">
                <li v-for="row in state.rows.value" :key="row.id">
                  <div class="approval-event-heading">
                    <strong>{{ t(`proto.approvalAction_${row.action}`) }}</strong
                    ><time :datetime="new Date(row.createTime).toISOString()">{{
                      time(row.createTime)
                    }}</time>
                  </div>
                  <p class="muted">
                    {{ row.actorName }} ·
                    {{ t(row.approved ? 'proto.approvalApproved' : 'proto.approvalPending') }} ·
                    {{ t(row.published ? 'proto.approvalPublished' : 'proto.approvalUnpublished') }}
                  </p>
                  <p v-if="row.note" class="approval-note">{{ row.note }}</p>
                  <a-button
                    v-if="row.action === 'publish'"
                    type="link"
                    @click="showSnapshot(row)"
                    >{{ t('proto.approvalSnapshot') }}</a-button
                  >
                </li>
              </ol>
              <a-pagination
                v-if="state.total.value > 10"
                :current="state.pageIndex.value + 1"
                :page-size="10"
                :total="state.total.value"
                :show-size-changer="false"
                :show-less-items="true"
                @change="state.page"
              />
            </load-state>
          </details>
          <details class="approval-help">
            <summary>{{ t('proto.approvalHelp') }}</summary>
            <p>{{ t('proto.approvalScope') }}</p>
          </details>
        </template>
      </template>
    </load-state>
    <ModalContextHolder />
  </section>
</template>
<style scoped>
.approval-panel {
  min-width: 0;
}

.approval-heading,
.approval-event-heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: var(--space-3);
}

.approval-heading > div {
  min-width: 0;
}

.approval-heading h2,
.approval-status h3,
.approval-snapshot h3 {
  margin: 0;
}

.approval-heading p,
.approval-status p {
  margin: var(--space-2) 0;
}

.approval-heading p,
.approval-panel p,
.approval-events,
.approval-metadata {
  overflow-wrap: anywhere;
}

.approval-status {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  padding-block: var(--space-4);
  border-block: 1px solid var(--color-border);
}

.approval-status h3 {
  font-size: var(--text-title);
}

.approval-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.approval-actions :deep(.ant-btn) {
  min-height: 36px;
  height: auto;
  white-space: normal;
}

.approval-events {
  list-style: none;
  padding: 0;
  margin: var(--space-3) 0;
}

.approval-events li {
  padding-block: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.approval-events p {
  margin-block: var(--space-2);
}

.approval-event-heading time {
  color: var(--color-muted);
  font-size: var(--text-small);
}

.approval-note {
  white-space: pre-wrap;
}

.approval-help {
  color: var(--color-muted);
}

summary {
  cursor: pointer;
  width: fit-content;
}

summary:focus-visible,
a:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}

.approval-metadata {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2) var(--space-4);
}

.approval-metadata dd {
  margin: 0;
  overflow-wrap: anywhere;
}

@media (width <= 540px) {
  .approval-status {
    gap: var(--space-3);
  }

  .approval-event-heading {
    flex-direction: column;
    gap: var(--space-1);
  }

  .approval-metadata {
    grid-template-columns: 1fr;
  }
}
</style>
