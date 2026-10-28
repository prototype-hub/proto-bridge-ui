<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import {
  Drawer as ADrawer,
  Button as AButton,
  Alert as AAlert,
  Tag as ATag,
  RadioGroup as ARadioGroup,
  RadioButton as ARadioButton,
  Pagination as APagination,
  Modal as AModal,
  Empty as AEmpty,
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
const hasFilters = computed(() => !!state.filter.value || !!state.assignment.value)
const emptyPage = computed(() => state.total.value > 0 || state.pageIndex.value > 0)
const identityError = computed(
  () => state.authenticationRequired.value && state.error.value === t('proto.overviewAuthenticate'),
)
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
    :body-style="{ padding: 0, overflow: 'hidden' }"
    width="min(720px, 100vw)"
    @close="emit('close')"
  >
    <section
      class="feedback-overview"
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.feedbackOverview')"
    >
      <div class="overview-toolbar">
        <header class="overview-context">
          <p>
            {{
              t(state.isPublic.value ? 'proto.overviewVisitorScope' : 'proto.overviewMemberScope')
            }}
          </p>
          <details class="overview-help">
            <summary>{{ t('proto.feedbackHelp') }}</summary>
            <p>
              {{
                t(state.isPublic.value ? 'proto.overviewVisitorHint' : 'proto.overviewMemberHint')
              }}
            </p>
          </details>
        </header>
        <div
          v-if="
            state.isPublic.value &&
            (state.authenticationRequired.value || !state.policyEnabled.value)
          "
          class="overview-access"
        >
          <a-alert
            v-if="!identityLoading"
            type="warning"
            show-icon
            :message="
              t(state.policyEnabled.value ? 'proto.overviewAuthenticate' : 'proto.feedbackDisabled')
            "
          />
          <div v-if="state.policyEnabled.value" class="overview-actions">
            <a-button type="primary" :loading="identityLoading" @click="emit('authenticate')">
              {{ t('proto.reviewIdentity') }}
            </a-button>
            <a-button v-if="identityError" type="text" @click="state.load">{{
              t('common.retry')
            }}</a-button>
          </div>
        </div>
        <div v-if="state.readable.value" class="overview-filters">
          <div class="overview-filter">
            <strong>{{ t('proto.feedbackState') }}</strong>
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
          </div>
          <div v-if="!state.isPublic.value" class="overview-filter overview-assignment">
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
        </div>
      </div>
      <div v-if="state.readable.value" class="overview-results-heading">
        <div class="overview-result-count" aria-live="polite">
          <h2>{{ t('proto.overviewResults') }}</h2>
          <span v-if="!state.loading.value && !state.error.value">{{
            t('proto.overviewResultCount', { count: state.total.value })
          }}</span>
          <p v-if="hasFilters" class="overview-applied">
            <span v-if="state.filter.value">{{
              t(state.filter.value === 'open' ? 'proto.feedbackOpen' : 'proto.feedbackResolved')
            }}</span>
            <span v-if="!state.isPublic.value && state.assignment.value">{{
              t(
                state.assignment.value === 'mine'
                  ? 'proto.overviewAssignmentMine'
                  : 'proto.overviewAssignmentUnassigned',
              )
            }}</span>
          </p>
        </div>
        <div class="overview-actions">
          <a-button type="text" :disabled="state.loading.value" @click="state.load">{{
            t('common.refresh')
          }}</a-button>
          <a-button
            type="text"
            :disabled="state.loading.value || !hasFilters"
            @click="state.clearFilters"
            >{{ t('proto.overviewClear') }}</a-button
          >
        </div>
      </div>
      <div class="overview-results" tabindex="-1">
        <load-state
          :loading="state.loading.value || !!identityLoading"
          :error="identityError ? '' : state.error.value"
          @retry="state.load"
        >
          <template v-if="state.readable.value">
            <a-empty
              v-if="state.rows.value.length === 0"
              class="overview-empty"
              :description="
                t(
                  emptyPage
                    ? 'proto.overviewEmptyPage'
                    : hasFilters
                      ? 'proto.overviewNoMatches'
                      : 'proto.overviewEmpty',
                )
              "
            >
              <p>
                {{
                  t(
                    emptyPage
                      ? 'proto.overviewEmptyPageHint'
                      : hasFilters
                        ? 'proto.overviewNoMatchesHint'
                        : 'proto.overviewEmptyHint',
                  )
                }}
              </p>
              <a-button v-if="emptyPage" @click="state.page(1)">{{
                t('proto.overviewFirstPage')
              }}</a-button>
            </a-empty>
            <ul v-else class="overview-list">
              <li v-for="row in state.rows.value" :key="row.id" class="overview-row">
                <div class="overview-row-content">
                  <div class="overview-row-heading">
                    <h3>{{ row.summary }}</h3>
                    <a-tag :color="row.state === 'open' ? 'processing' : 'success'">{{
                      t(row.state === 'open' ? 'proto.feedbackOpen' : 'proto.feedbackResolved')
                    }}</a-tag>
                  </div>
                  <p class="overview-page">
                    <strong>{{ row.pageName }}</strong
                    ><span>{{ row.pagePath }}</span>
                  </p>
                  <div class="overview-meta">
                    <span>{{ row.authorName }}</span>
                    <a-tag>{{
                      t(
                        row.verificationLevel === 'email'
                          ? 'proto.reviewEmailVerified'
                          : 'proto.reviewUnverified',
                      )
                    }}</a-tag>
                    <time :datetime="new Date(row.createdAt).toISOString()">{{
                      new Date(row.createdAt).toLocaleString()
                    }}</time>
                  </div>
                </div>
                <a-button
                  type="link"
                  :disabled="blocked || state.loading.value"
                  @click="view(row)"
                  >{{ t('proto.overviewView') }}</a-button
                >
              </li>
            </ul>
          </template>
        </load-state>
      </div>
      <footer
        v-if="state.readable.value && (state.total.value > 0 || state.pageIndex.value > 0)"
        class="overview-footer"
      >
        <a-pagination
          class="overview-pagination"
          :current="state.pageIndex.value + 1"
          :page-size="20"
          :total="state.total.value"
          :show-size-changer="false"
          :disabled="state.loading.value"
          simple
          @change="state.page"
        />
      </footer>
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
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  margin-inline: var(--space-6);
  overflow-wrap: anywhere;
}
.overview-toolbar {
  flex: none;
  max-height: 50%;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.overview-context {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  padding-block: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.overview-context > p {
  margin: 0;
  font-weight: 600;
}
.overview-help {
  color: var(--color-muted);
  font-size: var(--text-small);
  line-height: 1.6;
}
.overview-help summary {
  width: fit-content;
  padding-block: var(--space-1);
  cursor: pointer;
}
.overview-help p {
  margin: var(--space-2) 0 0;
}
.overview-help[open] {
  flex-basis: 100%;
}
.overview-help summary:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.overview-access {
  display: grid;
  justify-items: start;
  gap: var(--space-4);
  padding-block: var(--space-4);
}
.overview-filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4) var(--space-6);
  padding-block: var(--space-4);
}
.overview-filter {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.overview-filter :deep(.ant-radio-group) {
  display: flex;
}
.overview-filter :deep(.ant-radio-button-wrapper) {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  justify-content: center;
  padding-inline: var(--space-2);
  text-align: center;
}
.overview-filter > strong {
  font-size: var(--text-small);
  color: var(--color-muted);
}
.feedback-overview :deep(.ant-btn),
.feedback-overview :deep(.ant-radio-button-wrapper) {
  max-width: 100%;
  height: auto;
  min-height: 32px;
  white-space: normal;
}
.overview-results-heading {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  padding-block: var(--space-3);
  border-bottom: 1px solid var(--color-border);
}
.overview-result-count {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}
.overview-result-count h2 {
  margin: 0;
  font-size: var(--text-body);
  line-height: 1.5;
}
.overview-result-count > span,
.overview-applied,
.overview-meta,
.overview-page {
  color: var(--color-muted);
  font-size: var(--text-small);
}
.overview-applied {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  flex-basis: 100%;
  margin: 0;
}
.overview-results {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.overview-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.overview-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
  padding-block: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.overview-row-content {
  display: grid;
  min-width: 0;
  gap: var(--space-2);
}
.overview-row-heading {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
}
.overview-row-heading h3 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--text-body);
  line-height: 1.5;
  white-space: pre-wrap;
}
.overview-row-heading :deep(.ant-tag) {
  flex: none;
  margin: 0;
}
.overview-page {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
  margin: 0;
}
.overview-page strong {
  font-weight: 500;
}
.overview-meta,
.overview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
}
.overview-meta :deep(.ant-tag) {
  margin: 0;
}
.overview-meta time {
  font-variant-numeric: tabular-nums;
}
.overview-results-heading .overview-actions :deep(.ant-btn) {
  padding-inline: var(--space-2);
}
.overview-footer {
  flex: none;
  display: flex;
  justify-content: flex-end;
  padding-block: var(--space-3);
  border-top: 1px solid var(--color-border);
}
.overview-pagination {
  max-width: 100%;
  margin-left: auto;
}
.overview-empty {
  margin-block: var(--space-8);
}
.overview-empty p {
  margin: 0 auto;
  max-width: 35rem;
  line-height: 1.6;
  color: var(--color-muted);
}
@media (max-width: 480px) {
  .overview-row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
  }
  .overview-row > :deep(.ant-btn) {
    justify-self: end;
    padding-inline: 0;
  }
  .overview-filters {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
