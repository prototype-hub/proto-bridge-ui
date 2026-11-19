<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, toRef, watch } from 'vue'
import {
  Alert as AAlert,
  Button as AButton,
  Drawer as ADrawer,
  Form as AForm,
  FormItem as AFormItem,
  InputSearch as AInputSearch,
  Modal,
  Pagination as APagination,
  Tag as ATag,
  Textarea as ATextarea,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useSession } from '@/app/stores/session'
import type {
  PageDeliveryCandidate,
  PageDeliveryState,
  Project,
  Revision,
} from '@/modules/protohub-manager-ui/types'
import {
  deliveryStates,
  usePageDeliveries,
} from '@/modules/protohub-manager-ui/views/project/hooks/usePageDeliveries'
import LoadState from '@/shared/components/LoadState.vue'

const props = defineProps<{ project?: Project; revision?: Revision; pageId?: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const session = useSession()
const [modal, ModalContextHolder] = Modal.useModal()
const scope = computed(() =>
  props.project && props.revision && session.user?.id
    ? { actorId: session.user.id, project: props.project, revision: props.revision }
    : undefined,
)
const state = usePageDeliveries(scope, toRef(props, 'pageId'))
const heading = ref<HTMLElement>()
const selectedAssignee = ref<PageDeliveryCandidate>()
watch(
  () => state.form.assigneeId,
  (id) => {
    selectedAssignee.value = state.candidates.value.find((person) => person.userId === id)
  },
  { flush: 'sync' },
)
watch(
  state.current,
  (value) => {
    if (!value) selectedAssignee.value = undefined
  },
  { flush: 'sync' },
)
const colors = { DRAFT: 'default', READY: 'blue', IN_PROGRESS: 'orange', DONE: 'green' }
const assigneeOptions = computed(() => {
  const current = state.current.value?.assignee
  const rows = state.candidates.value.map((row) => ({ ...row, available: true }))
  if (selectedAssignee.value && !rows.some((row) => row.userId === selectedAssignee.value?.userId))
    rows.unshift({ ...selectedAssignee.value, available: true })
  if (current && !rows.some((row) => row.userId === current.userId)) rows.unshift(current)
  return rows
})
function confirmLeave(): Promise<boolean> {
  if (state.busy.value || state.unknown.value) return Promise.resolve(false)
  if (!state.dirty.value) return Promise.resolve(true)
  return new Promise((resolve) =>
    modal.confirm({
      title: t('proto.deliveryLeaveTitle'),
      content: t('proto.deliveryLeaveHint'),
      okText: t('proto.deliveryLeave'),
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
function selectPage(pageId: string) {
  leave(() => state.selectPage(pageId))
}
function changeFilter(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  leave(() => state.changeFilter(value ? (value as PageDeliveryState) : undefined))
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
watch(state.current, async (value, previous) => {
  if (value && value.pageId !== previous?.pageId) {
    await nextTick()
    heading.value?.focus()
  }
})
watch(state.invalid, async (value) => {
  if (value) {
    await nextTick()
    document.getElementById('delivery-state')?.focus()
  }
})
</script>
<template>
  <a-drawer
    :open="!!revision"
    :title="t('proto.pageDelivery')"
    width="min(800px, 100vw)"
    root-class-name="page-delivery-drawer"
    :closable="false"
    :keyboard="!state.busy.value && !state.unknown.value"
    :mask-closable="!state.busy.value && !state.unknown.value"
    @close="leave(() => emit('close'))"
  >
    <section
      class="delivery-workspace stack"
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.pageDelivery')"
    >
      <a-button
        class="delivery-close"
        :disabled="state.busy.value || state.unknown.value"
        @click="leave(() => emit('close'))"
        >{{ t('common.close') }}</a-button
      >
      <header class="delivery-context">
        <strong>{{ revision?.versionName }}</strong>
        <span class="muted"
          >{{ t('proto.deliveryFixed') }} · <span translate="no">{{ revision?.id }}</span></span
        >
      </header>
      <details class="delivery-help">
        <summary>{{ t('proto.feedbackHelp') }}</summary>
        <p>{{ t('proto.deliveryScope') }}</p>
        <p>{{ t('proto.deliveryIndependent') }}</p>
      </details>
      <a-alert
        v-if="state.error.value"
        type="error"
        show-icon
        role="alert"
        :message="state.error.value"
      />
      <template v-if="!state.unavailable.value">
        <a-button
          v-if="state.selectedPageId.value"
          class="delivery-back"
          :disabled="state.busy.value || state.unknown.value"
          @click="selectPage('')"
          >{{ t('proto.deliveryBack') }}</a-button
        >
        <div v-else class="delivery-list-header">
          <h3>{{ t('proto.deliveryList') }}</h3>
          <label for="delivery-filter">{{ t('proto.deliveryFilter') }}</label>
          <select
            id="delivery-filter"
            class="delivery-select"
            :value="state.filter.value || ''"
            :disabled="state.busy.value || state.unknown.value"
            @change="changeFilter"
          >
            <option value="">{{ t('proto.deliveryAll') }}</option>
            <option v-for="value in deliveryStates" :key="value" :value="value">
              {{ t(`proto.deliveryState_${value}`) }}
            </option>
          </select>
          <p class="muted">{{ t('proto.deliveryListHint') }}</p>
        </div>
        <template v-if="state.selectedPageId.value">
          <a-alert
            v-if="state.notice.value"
            :type="state.unknown.value || state.conflict.value ? 'warning' : 'success'"
            show-icon
            role="status"
            aria-live="polite"
            :message="state.notice.value"
            class="delivery-notice"
          >
            <template v-if="state.unknown.value" #description
              ><div class="delivery-actions">
                <a-button
                  :disabled="state.busy.value || state.detailLoading.value"
                  @click="state.loadDetail(true)"
                  >{{ t('proto.deliveryCheck') }}</a-button
                ><a-button type="primary" :loading="state.busy.value" @click="state.retry">{{
                  t('proto.deliveryRetry')
                }}</a-button>
              </div></template
            >
            <template v-else-if="state.conflict.value" #description
              ><a-button :loading="state.detailLoading.value" @click="state.loadDetail(true)">{{
                t('proto.deliveryRefreshDraft')
              }}</a-button></template
            >
          </a-alert>
          <load-state
            :loading="state.detailLoading.value"
            :error="state.detailError.value"
            @retry="state.loadDetail(state.dirty.value)"
          >
            <template v-if="state.current.value">
              <h3 ref="heading" tabindex="-1" class="delivery-page-title">
                {{ state.current.value.pageName }}
              </h3>
              <p class="delivery-path muted" translate="no">{{ state.current.value.pagePath }}</p>
              <section class="delivery-current" :aria-label="t('proto.deliveryCurrent')">
                <h4>{{ t('proto.deliveryCurrent') }}</h4>
                <a-tag
                  :color="state.current.value.state ? colors[state.current.value.state] : 'default'"
                  >{{
                    t(
                      state.current.value.state
                        ? `proto.deliveryState_${state.current.value.state}`
                        : 'proto.deliveryUnset',
                    )
                  }}</a-tag
                >
                <span>{{
                  state.current.value.assignee
                    ? state.current.value.assignee.available
                      ? state.current.value.assignee.name
                      : t('proto.deliveryUnavailablePerson', {
                          name: state.current.value.assignee.name,
                        })
                    : t('proto.deliveryNobody')
                }}</span>
                <p v-if="state.current.value.reason" class="delivery-reason">
                  {{ state.current.value.reason }}
                </p>
                <p v-if="state.current.value.updatedAt" class="muted">
                  {{ t('proto.deliveryUpdated') }} ·
                  {{ new Date(state.current.value.updatedAt).toLocaleString() }}
                </p>
              </section>
              <a-form
                v-if="state.canEdit.value"
                layout="vertical"
                name="page-delivery-editor"
                class="delivery-editor"
                :model="state.form"
                @submit.prevent
              >
                <h3>{{ t('proto.deliveryEdit') }}</h3>
                <a-form-item
                  :label="t('proto.deliveryState')"
                  html-for="delivery-state"
                  required
                  :validate-status="state.invalid.value ? 'error' : undefined"
                  :help="state.invalid.value"
                >
                  <select
                    id="delivery-state"
                    v-model="state.form.state"
                    :aria-label="t('proto.deliveryState')"
                    class="delivery-select"
                    :disabled="state.busy.value || state.unknown.value"
                    :aria-invalid="!!state.invalid.value"
                  >
                    <option :value="undefined" disabled>{{ t('proto.deliveryUnset') }}</option>
                    <option v-for="value in deliveryStates" :key="value" :value="value">
                      {{ t(`proto.deliveryState_${value}`) }}
                    </option>
                  </select>
                </a-form-item>
                <a-form-item :label="t('proto.deliveryAssignee')" html-for="delivery-assignee">
                  <select
                    id="delivery-assignee"
                    v-model="state.form.assigneeId"
                    :aria-label="t('proto.deliveryAssignee')"
                    class="delivery-select"
                    :disabled="
                      state.busy.value || state.unknown.value || state.candidatesLoading.value
                    "
                  >
                    <option :value="null">{{ t('proto.deliveryNobody') }}</option>
                    <option
                      v-for="person in assigneeOptions"
                      :key="person.userId"
                      :value="person.userId"
                      :disabled="!person.available"
                    >
                      {{
                        person.available
                          ? person.name
                          : t('proto.deliveryUnavailablePerson', { name: person.name })
                      }}
                    </option>
                  </select>
                  <p
                    v-if="state.unavailableAssignee.value"
                    class="delivery-assignee-warning"
                    role="alert"
                  >
                    {{ t('proto.deliveryUnavailableHint') }}
                  </p>
                  <div class="delivery-candidates">
                    <a-input-search
                      v-model:value="state.candidateKeyword.value"
                      :aria-label="t('proto.deliveryCandidates')"
                      :placeholder="t('proto.deliveryCandidates')"
                      :maxlength="100"
                      :disabled="state.busy.value || state.unknown.value"
                      @search="state.searchCandidates"
                    /><a-button v-if="state.candidateError.value" @click="state.loadCandidates">{{
                      t('common.retry')
                    }}</a-button>
                  </div>
                  <p v-if="state.candidateError.value" role="alert">
                    {{ state.candidateError.value }}
                  </p>
                  <a-pagination
                    v-if="state.candidateTotal.value > 20"
                    :aria-label="t('proto.deliveryCandidatePage')"
                    size="small"
                    simple
                    :current="state.candidateIndex.value + 1"
                    :page-size="20"
                    :total="state.candidateTotal.value"
                    :show-size-changer="false"
                    :disabled="state.busy.value || state.unknown.value"
                    @change="state.candidatePage"
                  />
                </a-form-item>
                <a-form-item :label="t('proto.deliveryReason')" html-for="delivery-reason"
                  ><a-textarea
                    id="delivery-reason"
                    v-model:value="state.form.reason"
                    :rows="4"
                    :maxlength="2000"
                    show-count
                    :disabled="state.busy.value || state.unknown.value"
                /></a-form-item>
                <div class="delivery-actions">
                  <a-button
                    type="primary"
                    html-type="button"
                    :loading="state.busy.value"
                    :disabled="
                      state.unknown.value ||
                      state.conflict.value ||
                      state.detailLoading.value ||
                      state.unavailableAssignee.value ||
                      !state.dirty.value
                    "
                    @click="state.save"
                    >{{ t('common.save') }}</a-button
                  ><a-button
                    :disabled="state.busy.value || state.unknown.value || !state.dirty.value"
                    @click="leave(state.discard)"
                    >{{ t('common.cancel') }}</a-button
                  >
                </div>
              </a-form>
              <p v-else class="muted">{{ t('proto.deliveryReadOnly') }}</p>
            </template>
          </load-state>
        </template>
        <load-state
          v-else
          :loading="state.loading.value"
          :error="state.error.value"
          @retry="state.loadList"
        >
          <p v-if="!state.rows.value.length" class="muted">{{ t('proto.deliveryEmpty') }}</p>
          <ul v-else class="delivery-list">
            <li v-for="row in state.rows.value" :key="row.pageId" class="delivery-row">
              <button type="button" class="delivery-page-button" @click="selectPage(row.pageId)">
                <strong>{{ row.pageName }}</strong
                ><span class="delivery-path muted" translate="no">{{ row.pagePath }}</span>
              </button>
              <div class="delivery-row-meta">
                <a-tag :color="row.state ? colors[row.state] : 'default'">{{
                  t(row.state ? `proto.deliveryState_${row.state}` : 'proto.deliveryUnset')
                }}</a-tag
                ><span>{{
                  row.assignee
                    ? row.assignee.available
                      ? row.assignee.name
                      : t('proto.deliveryUnavailablePerson', { name: row.assignee.name })
                    : t('proto.deliveryNobody')
                }}</span>
              </div>
            </li>
          </ul>
          <a-pagination
            v-if="state.total.value > 20"
            class="delivery-pagination"
            :current="state.pageIndex.value + 1"
            :page-size="20"
            :total="state.total.value"
            :show-size-changer="false"
            :show-less-items="true"
            @change="state.page"
          />
        </load-state>
      </template>
    </section>
    <ModalContextHolder />
  </a-drawer>
</template>
<style scoped>
.delivery-close {
  justify-self: end;
}
.delivery-workspace {
  min-width: 0;
}
.delivery-context {
  display: grid;
  gap: var(--space-1);
  overflow-wrap: anywhere;
}
.delivery-help {
  color: var(--color-muted);
}
.delivery-help summary {
  cursor: pointer;
}
.delivery-help p {
  margin: var(--space-2) 0;
}
.delivery-list-header {
  display: grid;
  gap: var(--space-2);
}
.delivery-list-header h3,
.delivery-current h4,
.delivery-page-title {
  margin: 0;
}
.delivery-list-header p,
.delivery-path {
  margin: 0;
}
.delivery-select {
  width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}
.delivery-select:focus-visible,
.delivery-page-button:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
.delivery-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.delivery-current {
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-background);
  overflow-wrap: anywhere;
}
.delivery-current h4 {
  margin-bottom: var(--space-2);
}
.delivery-reason {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin-top: var(--space-3);
}
.delivery-editor {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-4);
}
.delivery-actions,
.delivery-candidates,
.delivery-row-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.delivery-actions :deep(.ant-btn) {
  height: auto;
  min-height: 32px;
  white-space: normal;
}
.delivery-candidates {
  margin-top: var(--space-2);
}
.delivery-back {
  justify-self: start;
  max-width: 100%;
  white-space: normal;
  height: auto;
  min-height: 32px;
}
.delivery-notice :deep(.ant-alert-message),
.delivery-notice :deep(.ant-alert-description) {
  overflow-wrap: anywhere;
}
.delivery-path {
  display: block;
  overflow-wrap: anywhere;
  font-size: var(--text-small);
}
.delivery-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.delivery-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(130px, 0.65fr);
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-border);
}
.delivery-page-button {
  text-align: start;
  border: 0;
  padding: var(--space-1);
  background: transparent;
  color: var(--color-primary);
  font: inherit;
  cursor: pointer;
  min-width: 0;
  overflow-wrap: anywhere;
}
.delivery-row-meta {
  overflow-wrap: anywhere;
}
.delivery-pagination {
  margin-top: var(--space-4);
}
@media (max-width: 540px) {
  .delivery-row {
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }
  .delivery-current {
    padding: var(--space-3);
  }
}
</style>
