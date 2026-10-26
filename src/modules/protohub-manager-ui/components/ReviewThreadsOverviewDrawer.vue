<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import {
  Drawer as ADrawer,
  Button as AButton,
  Alert as AAlert,
  Tag as ATag,
  RadioGroup as ARadioGroup,
  RadioButton as ARadioButton,
  Pagination as APagination,
  Modal as AModal,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import LoadState from '@/shared/components/LoadState.vue'
import type { ReviewThread } from '../types'
import type { ReviewThreadsOverviewController } from '../hooks/useReviewThreadsOverview'

const props = defineProps<{
  open: boolean
  state: ReviewThreadsOverviewController
  identityLoading?: boolean
  blocked?: boolean
  guarded?: boolean
  currentThreadId?: string
}>()
const emit = defineEmits<{ close: []; authenticate: []; view: [thread: ReviewThread] }>()
const { t } = useI18n()
const state = props.state
const pendingView = shallowRef<ReviewThread>()
function view(thread: ReviewThread) {
  if (props.blocked) return
  if (props.guarded && thread.id !== props.currentThreadId) pendingView.value = thread
  else emit('view', thread)
}
function confirmView() {
  if (props.blocked || !pendingView.value) return
  emit('view', pendingView.value)
  pendingView.value = undefined
}
// A confirmation cannot outlive the visible list or a scope/actor reload.
watch([() => props.open, state.rows], () => {
  pendingView.value = undefined
})
</script>
<template>
  <a-drawer
    :open="open"
    :title="t('proto.feedbackOverview')"
    width="min(720px, 100vw)"
    @close="emit('close')"
  >
    <section
      class="stack feedback-overview"
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.feedbackOverview')"
    >
      <a-alert
        type="info"
        show-icon
        :message="
          t(state.isPublic.value ? 'proto.overviewVisitorHint' : 'proto.overviewMemberHint')
        "
      />
      <template
        v-if="
          state.isPublic.value && (state.authenticationRequired.value || !state.policyEnabled.value)
        "
      >
        <a-alert
          v-if="!identityLoading"
          type="warning"
          show-icon
          :message="
            t(state.policyEnabled.value ? 'proto.overviewAuthenticate' : 'proto.feedbackDisabled')
          "
        />
        <a-button
          v-if="state.policyEnabled.value"
          :loading="identityLoading"
          @click="emit('authenticate')"
          >{{ t('proto.reviewIdentity') }}</a-button
        >
      </template>
      <template v-if="state.readable.value">
        <div v-if="!state.isPublic.value" class="stack overview-assignment">
          <strong>{{ t('proto.overviewAssignment') }}</strong>
          <a-radio-group
            :value="state.assignment.value"
            :aria-label="t('proto.overviewAssignment')"
            :disabled="state.loading.value"
            @update:value="state.changeAssignment"
          >
            <a-radio-button value="">{{ t('proto.overviewAssignmentAll') }}</a-radio-button>
            <a-radio-button value="mine">{{ t('proto.overviewAssignmentMine') }}</a-radio-button>
            <a-radio-button value="unassigned">{{
              t('proto.overviewAssignmentUnassigned')
            }}</a-radio-button>
          </a-radio-group>
        </div>
        <a-radio-group
          :value="state.filter.value"
          :aria-label="t('proto.feedbackState')"
          :disabled="state.loading.value"
          @update:value="state.changeFilter"
        >
          <a-radio-button value="">{{ t('common.all') }}</a-radio-button>
          <a-radio-button value="open">{{ t('proto.feedbackOpen') }}</a-radio-button>
          <a-radio-button value="resolved">{{ t('proto.feedbackResolved') }}</a-radio-button>
        </a-radio-group>
        <div class="overview-actions">
          <a-button :disabled="state.loading.value" @click="state.load">{{
            t('common.refresh')
          }}</a-button>
          <a-button
            :disabled="state.loading.value || (!state.filter.value && !state.assignment.value)"
            @click="state.clearFilters"
            >{{ t('proto.overviewClear') }}</a-button
          >
        </div>
      </template>
      <load-state
        :loading="state.loading.value || !!identityLoading"
        :error="state.error.value"
        @retry="state.load"
      >
        <load-state v-if="state.readable.value" :empty="state.rows.value.length === 0">
          <ul class="overview-list">
            <li v-for="row in state.rows.value" :key="row.id" class="overview-row">
              <strong>{{ row.pageName }}</strong
              ><span>{{ row.pagePath }}</span>
              <p>{{ row.summary }}</p>
              <div class="overview-meta">
                <a-tag>{{
                  t(row.state === 'open' ? 'proto.feedbackOpen' : 'proto.feedbackResolved')
                }}</a-tag>
                <span>{{ row.authorName }}</span>
                <a-tag>{{
                  t(
                    row.verificationLevel === 'email'
                      ? 'proto.reviewEmailVerified'
                      : 'proto.reviewUnverified',
                  )
                }}</a-tag>
                <time>{{ new Date(row.createdAt).toLocaleString() }}</time>
              </div>
              <a-button :disabled="blocked || state.loading.value" @click="view(row)">{{
                t('proto.overviewView')
              }}</a-button>
            </li>
          </ul>
        </load-state>
      </load-state>
      <a-pagination
        v-if="state.readable.value && (state.total.value > 0 || state.pageIndex.value > 0)"
        class="overview-pagination"
        :current="state.pageIndex.value + 1"
        :page-size="20"
        :total="state.total.value"
        :show-size-changer="false"
        :disabled="state.loading.value"
        simple
        @change="state.page"
      />
    </section>
  </a-drawer>
  <a-modal
    :open="!!pendingView"
    :title="t('proto.overviewLeaveTitle')"
    :footer="null"
    width="min(480px, 100vw)"
    @cancel="pendingView = undefined"
  >
    <p>{{ t('proto.overviewLeaveHint') }}</p>
    <div class="overview-actions">
      <a-button @click="pendingView = undefined">{{ t('common.cancel') }}</a-button>
      <a-button danger :disabled="blocked" @click="confirmView">{{
        t('proto.overviewLeaveConfirm')
      }}</a-button>
    </div>
  </a-modal>
</template>
<style scoped>
.feedback-overview {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
}
.overview-assignment {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-2);
}
.feedback-overview :deep(.ant-btn),
.feedback-overview :deep(.ant-radio-button-wrapper) {
  max-width: 100%;
  height: auto;
  min-height: 32px;
  white-space: normal;
}
.overview-list {
  display: grid;
  gap: var(--space-4);
  padding: 0;
  list-style: none;
}
.overview-row {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  padding-block: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  overflow-wrap: anywhere;
}
.overview-row p {
  margin: 0;
  white-space: pre-wrap;
}
.overview-meta,
.overview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
}
.overview-pagination {
  align-self: flex-end;
  max-width: 100%;
  margin-left: auto;
}
</style>
