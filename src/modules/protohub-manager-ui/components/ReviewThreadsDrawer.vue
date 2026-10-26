<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import {
  Drawer as ADrawer,
  Button as AButton,
  Alert as AAlert,
  Tag as ATag,
  Textarea as ATextarea,
  Pagination as APagination,
  RadioGroup as ARadioGroup,
  RadioButton as ARadioButton,
  Input as AInput,
  Select as ASelect,
  Modal as AModal,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import LoadState from '@/shared/components/LoadState.vue'
import type { ReviewPage, ReviewAnchor, ReviewThread, ReviewThreadState } from '../types'
import type { ReviewThreadsController } from '../hooks/useReviewThreads'
const props = defineProps<{
  open: boolean
  page?: ReviewPage
  state: ReviewThreadsController
  identityLoading?: boolean
}>()
const emit = defineEmits<{
  close: []
  authenticate: []
  copyThread: [event: MouseEvent]
  captureAnchor: [shape: ReviewAnchor['shape']]
  locateAnchor: [anchor: ReviewAnchor]
  overview: []
}>()
const { t } = useI18n()
const state = props.state
const assignment = state.assignment
const mode = ref<'list' | 'detail'>(
  state.selectedId.value || state.isPublic.value ? 'detail' : 'list',
)
const content = ref<HTMLElement>(),
  taskHeading = ref<HTMLElement>(),
  listHeading = ref<HTMLElement>()
type ListChange = { filter: ReviewThreadState | '' } | { page: number }
const pendingSelection = shallowRef<{ thread?: ReviewThread } | ListChange>()
const blocked = computed(() => state.busy.value || assignment.busy.value)
const guarded = computed(
  () =>
    !!state.text.value ||
    !!state.imageFile.value ||
    !!state.anchor.value ||
    state.hasPendingRequest.value ||
    assignment.editing.value ||
    assignment.unknown.value,
)
async function show(next: 'list' | 'detail') {
  mode.value = next
  await nextTick()
  if (props.open) (next === 'list' ? listHeading : taskHeading).value?.focus()
}
function afterOpen(visible: boolean) {
  // The drawer's entrance may finish after the user has already started editing.
  if (visible && !pendingSelection.value && !content.value?.contains(document.activeElement))
    void show(mode.value)
}
function choose(thread?: ReviewThread) {
  // Returning to the same task is visual only, including while its request is pending.
  if (thread?.id === state.selectedId.value) {
    void show('detail')
    return
  }
  if (blocked.value) return
  if (guarded.value) pendingSelection.value = { thread }
  else select(thread)
}
function select(thread?: ReviewThread) {
  if (blocked.value || (thread && !state.threads.value.includes(thread))) return
  state.choose(thread)
  pendingSelection.value = undefined
  void show('detail')
}
function confirmSelection() {
  const pending = pendingSelection.value
  if (!pending) return
  if ('filter' in pending || 'page' in pending) changeList(pending, true)
  else select(pending.thread)
}
function cancelPending(event: KeyboardEvent) {
  if (!pendingSelection.value) return
  // During modal entrance focus can still be on a control in the drawer.
  event.stopPropagation()
  event.preventDefault()
  pendingSelection.value = undefined
  void show(mode.value)
}
function changeList(change: ListChange, confirmed = false) {
  if (blocked.value) return
  // The existing controller clears an unlocated new draft when its list query changes.
  if (!confirmed && !state.targeted.value && guarded.value) pendingSelection.value = change
  else {
    pendingSelection.value = undefined
    if ('filter' in change) state.changeFilter(change.filter)
    else state.page(change.page)
  }
}
watch(state.selectedId, () => {
  pendingSelection.value = undefined
  if (props.open) void show(state.selectedId.value || state.isPublic.value ? 'detail' : 'list')
})
watch(
  [
    () => props.open,
    () => props.page?.revisionId,
    () => props.page?.pageId,
    state.readable,
    state.threads,
  ],
  () => {
    pendingSelection.value = undefined
  },
)
watch(
  () => props.open,
  (open, previous) => {
    if (open)
      void show(
        previous === undefined
          ? mode.value
          : state.selectedId.value || (state.isPublic.value && !state.threads.value.length)
            ? 'detail'
            : 'list',
      )
  },
  { immediate: true },
)
const assigneeOptions = computed(() =>
  assignment.candidates.value.map((row) => ({ value: row.userId, label: row.name })),
)
const canSend = computed(
  () =>
    state.writable.value &&
    (!state.selectedId.value ? state.isPublic.value : !!state.selected.value),
)
function selectImage(event: Event) {
  const input = event.target as HTMLInputElement
  state.selectImage(input.files?.[0])
  input.value = ''
}
</script>
<template>
  <a-drawer
    :open="open"
    :autofocus="false"
    :keyboard="!pendingSelection"
    :title="t('proto.feedback')"
    width="min(600px, 100vw)"
    @after-open-change="afterOpen"
    @close="emit('close')"
  >
    <section
      ref="content"
      class="stack review-threads"
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.feedback')"
      @keydown.esc="cancelPending"
    >
      <div class="feedback-context">
        <p class="feedback-page">
          <strong>{{ page?.name }}</strong
          ><span>{{ page?.path }}</span>
        </p>
        <a-button @click="emit('overview')">{{ t('proto.feedbackOverview') }}</a-button>
      </div>
      <a-alert type="info" show-icon :message="t('proto.feedbackPageHint')" />
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
            t(!state.policyEnabled.value ? 'proto.feedbackDisabled' : 'proto.feedbackAuthenticate')
          "
        />
        <a-button
          v-if="state.policyEnabled.value"
          :loading="identityLoading"
          @click="emit('authenticate')"
          >{{ t('proto.reviewIdentity') }}</a-button
        >
        <a-button v-if="state.text.value" @click="state.copyDraft">{{
          t('proto.feedbackCopyDraft')
        }}</a-button>
      </template>
      <a-alert
        v-if="state.notice.value"
        type="warning"
        show-icon
        role="status"
        :message="state.notice.value"
      />
      <template v-if="mode === 'detail'">
        <div class="feedback-status-actions">
          <a-button @click="show('list')">{{ t('proto.feedbackBackToList') }}</a-button>
          <a-button :disabled="state.busy.value || state.loading.value" @click="state.load">{{
            t('common.refresh')
          }}</a-button>
        </div>
        <h3 ref="taskHeading" class="feedback-task-heading" tabindex="-1">
          {{
            state.selected.value?.summary ||
            t(state.selectedId.value ? 'proto.feedbackDetail' : 'proto.feedbackNew')
          }}
        </h3>
        <a-tag v-if="state.selected.value">{{
          t(state.selected.value.state === 'open' ? 'proto.feedbackOpen' : 'proto.feedbackResolved')
        }}</a-tag>
      </template>
      <template v-else>
        <h3 ref="listHeading" class="feedback-task-heading" tabindex="-1">
          {{ t('proto.feedbackPageList') }}
        </h3>
        <a-button v-if="state.selectedId.value || guarded" @click="show('detail')">{{
          t('proto.feedbackContinue')
        }}</a-button>
      </template>
      <template v-if="state.readable.value && mode === 'list'">
        <a-radio-group
          :value="state.filter.value"
          :disabled="blocked"
          :aria-label="t('proto.feedbackState')"
          @update:value="(filter) => changeList({ filter })"
        >
          <a-radio-button value="">{{ t('common.all') }}</a-radio-button>
          <a-radio-button value="open">{{ t('proto.feedbackOpen') }}</a-radio-button>
          <a-radio-button value="resolved">{{ t('proto.feedbackResolved') }}</a-radio-button>
        </a-radio-group>
        <a-button :disabled="state.busy.value || state.loading.value" @click="state.load">{{
          t('common.refresh')
        }}</a-button>
      </template>
      <load-state
        :loading="state.loading.value || !!identityLoading"
        :error="state.error.value"
        @retry="state.load"
      >
        <template v-if="state.readable.value">
          <template v-if="mode === 'list'">
            <load-state :empty="state.threads.value.length === 0">
              <ul class="feedback-threads">
                <li v-for="thread in state.threads.value" :key="thread.id">
                  <a-button
                    class="feedback-thread"
                    :aria-pressed="thread.id === state.selectedId.value"
                    :disabled="blocked && thread.id !== state.selectedId.value"
                    @click="choose(thread)"
                    >{{ thread.summary }}</a-button
                  >
                  <div class="feedback-meta">
                    <span>{{ thread.authorName }}</span
                    ><a-tag>{{
                      t(
                        thread.verificationLevel === 'email'
                          ? 'proto.reviewEmailVerified'
                          : 'proto.reviewUnverified',
                      )
                    }}</a-tag
                    ><a-tag>{{
                      t(thread.state === 'open' ? 'proto.feedbackOpen' : 'proto.feedbackResolved')
                    }}</a-tag>
                  </div>
                </li>
              </ul>
            </load-state>
            <a-pagination
              v-if="state.total.value > 0 || state.pageIndex.value > 0"
              class="feedback-pagination"
              :current="state.pageIndex.value + 1"
              :page-size="20"
              :total="state.total.value"
              :show-size-changer="false"
              :disabled="blocked"
              simple
              @change="(page) => changeList({ page })"
            />
            <a-button
              v-if="state.isPublic.value"
              :disabled="blocked && !!state.selectedId.value"
              @click="choose()"
              >{{ t('proto.feedbackNew') }}</a-button
            >
          </template>
          <template v-if="mode === 'detail' && state.selected.value">
            <template v-if="state.selected.value.anchor">
              <p>{{ t('proto.anchorSnapshotHint') }}</p>
              <a-button
                :disabled="state.busy.value || state.loading.value"
                @click="emit('locateAnchor', state.selected.value.anchor)"
                >{{ t('proto.anchorLocate') }}</a-button
              >
            </template>
            <section
              v-if="!state.isPublic.value"
              class="stack feedback-assignment"
              :aria-label="t('proto.assignment')"
            >
              <strong>{{ t('proto.assignment') }}</strong>
              <load-state
                :loading="assignment.loading.value"
                :error="assignment.error.value"
                @retry="assignment.load"
              >
                <template v-if="assignment.data.value">
                  <p v-if="!assignment.data.value.assignee">{{ t('proto.assignmentEmpty') }}</p>
                  <p v-else>
                    {{ assignment.data.value.assignee.name
                    }}<a-tag v-if="!assignment.data.value.assignee.available" color="orange">{{
                      t('proto.assignmentFormerUnavailable')
                    }}</a-tag>
                  </p>
                  <div class="feedback-status-actions">
                    <a-button :disabled="assignment.busy.value" @click="assignment.load">{{
                      t('proto.assignmentRefresh')
                    }}</a-button>
                    <a-button
                      v-if="assignment.canEdit.value && !assignment.unknown.value"
                      :disabled="assignment.busy.value"
                      @click="assignment.edit"
                      >{{ t('proto.assignmentEdit') }}</a-button
                    >
                    <a-button
                      v-if="
                        assignment.canEdit.value &&
                        assignment.data.value.assignee &&
                        !assignment.unknown.value
                      "
                      :disabled="assignment.busy.value"
                      @click="assignment.save(true)"
                      >{{ t('proto.assignmentClear') }}</a-button
                    >
                  </div>
                </template>
              </load-state>
              <a-alert
                v-if="assignment.notice.value"
                role="status"
                show-icon
                type="warning"
                :message="assignment.notice.value"
              />
              <div
                v-if="assignment.unknown.value && assignment.canEdit.value"
                class="feedback-status-actions"
              >
                <a-button :loading="assignment.busy.value" @click="assignment.retry">{{
                  t('proto.assignmentRetry')
                }}</a-button>
                <a-button :disabled="assignment.busy.value" @click="assignment.discard">{{
                  t('proto.assignmentDiscard')
                }}</a-button>
              </div>
              <div
                v-if="
                  assignment.editing.value && assignment.canEdit.value && !assignment.unknown.value
                "
                class="stack"
              >
                <label for="review-assignee-keyword">{{ t('proto.assignmentSearch') }}</label>
                <a-input
                  id="review-assignee-keyword"
                  v-model:value="assignment.keyword.value"
                  :maxlength="100"
                  :disabled="assignment.busy.value"
                  @press-enter="assignment.search()"
                />
                <a-button
                  :loading="assignment.searching.value"
                  :disabled="assignment.busy.value"
                  @click="assignment.search()"
                  >{{ t('proto.assignmentSearchAction') }}</a-button
                >
                <a-alert
                  v-if="assignment.searchError.value"
                  type="warning"
                  show-icon
                  :message="assignment.searchError.value"
                />
                <label for="review-assignee">{{ t('proto.assignmentCandidate') }}</label>
                <a-select
                  id="review-assignee"
                  v-model:value="assignment.selection.value"
                  class="assignment-picker"
                  :options="assigneeOptions"
                  :loading="assignment.searching.value"
                  :disabled="assignment.busy.value || assignment.searching.value"
                  :placeholder="t('proto.assignmentSelect')"
                />
                <a-pagination
                  v-if="assignment.total.value > 0 || assignment.pageIndex.value > 0"
                  class="feedback-pagination"
                  :current="assignment.pageIndex.value + 1"
                  :total="assignment.total.value"
                  :page-size="20"
                  :show-size-changer="false"
                  :disabled="assignment.busy.value || assignment.searching.value"
                  simple
                  @change="assignment.search"
                />
                <div class="feedback-status-actions">
                  <a-button
                    type="primary"
                    :loading="assignment.busy.value"
                    :disabled="!assignment.selection.value || assignment.searching.value"
                    @click="assignment.save()"
                    >{{ t('proto.assignmentSave') }}</a-button
                  >
                  <a-button :disabled="assignment.busy.value" @click="assignment.cancel">{{
                    t('common.cancel')
                  }}</a-button>
                </div>
              </div>
            </section>
            <div class="feedback-status-actions">
              <a-button
                :disabled="state.loading.value || state.busy.value"
                @click="emit('copyThread', $event)"
                >{{ t('proto.feedbackCopyLink') }}</a-button
              >
              <a-button
                v-if="!state.isPublic.value && state.selected.value.state === 'open'"
                :disabled="!state.writable.value || state.busy.value"
                @click="state.status('resolved')"
                >{{ t('proto.feedbackResolve') }}</a-button
              >
              <a-button
                v-if="state.selected.value.state === 'resolved'"
                :disabled="!state.writable.value || state.busy.value"
                @click="state.status('open')"
                >{{ t('proto.feedbackReopen') }}</a-button
              >
            </div>
            <h4 class="feedback-conversation">{{ t('proto.feedbackConversation') }}</h4>
            <ol class="feedback-messages">
              <li
                v-for="message in state.messages.value"
                :key="message.id"
                :class="{ 'feedback-internal': message.visibility === 'internal' }"
              >
                <div class="feedback-meta">
                  <strong>{{ message.authorName }}</strong
                  ><span v-if="message.authorCompany">{{ message.authorCompany }}</span
                  ><a-tag v-if="message.visibility === 'internal'" color="orange">{{
                    t('proto.feedbackInternal')
                  }}</a-tag
                  ><a-tag v-if="message.verificationLevel">{{
                    t(
                      message.verificationLevel === 'email'
                        ? 'proto.reviewEmailVerified'
                        : 'proto.reviewUnverified',
                    )
                  }}</a-tag
                  ><span>{{ new Date(message.createdAt).toLocaleString() }}</span>
                </div>
                <p class="feedback-text">{{ message.text }}</p>
                <template v-if="message.image">
                  <p>{{ t('proto.feedbackImageInfo', { ...message.image }) }}</p>
                  <a-button
                    :loading="
                      state.imageView.value?.messageId === message.id &&
                      state.imageView.value.loading
                    "
                    :aria-expanded="
                      state.imageView.value?.messageId === message.id && !!state.imageView.value.url
                    "
                    @click="state.viewImage(message)"
                    >{{
                      t(
                        state.imageView.value?.messageId === message.id && state.imageView.value.url
                          ? 'proto.feedbackImageHide'
                          : 'proto.feedbackImageView',
                      )
                    }}</a-button
                  >
                  <template v-if="state.imageView.value?.messageId === message.id">
                    <a-alert
                      v-if="state.imageView.value.error"
                      type="warning"
                      show-icon
                      role="status"
                      :message="state.imageView.value.error"
                    />
                    <img
                      v-if="state.imageView.value.url"
                      class="feedback-image"
                      :src="state.imageView.value.url"
                      :alt="t('proto.feedbackImageAlt')"
                      @error="state.imageFailed(message.id)"
                    />
                  </template>
                </template>
              </li>
            </ol>
            <a-pagination
              v-if="state.messagesTotal.value > 0 || state.messagesPageIndex.value > 0"
              class="feedback-pagination"
              :current="state.messagesPageIndex.value + 1"
              :page-size="20"
              :total="state.messagesTotal.value"
              :show-size-changer="false"
              :disabled="state.busy.value"
              simple
              @change="state.messagePage"
            />
          </template>
        </template>
      </load-state>
      <template
        v-if="
          mode === 'detail' &&
          (!state.targeted.value || state.selected.value) &&
          (state.isPublic.value || state.selectedId.value)
        "
      >
        <section
          v-if="state.isPublic.value && !state.selectedId.value"
          class="stack anchor-draft"
          :aria-label="t('proto.anchorTitle')"
        >
          <p>{{ t('proto.anchorHint') }}</p>
          <div class="feedback-status-actions">
            <a-button
              v-for="shape in ['point', 'rect', 'ellipse'] as const"
              :key="shape"
              :disabled="state.busy.value"
              @click="emit('captureAnchor', shape)"
              >{{ t(`proto.anchor${shape}`) }}</a-button
            >
          </div>
          <template v-if="state.anchor.value">
            <p role="status">
              {{
                t('proto.anchorSelected', {
                  shape: t(`proto.anchor${state.anchor.value.shape}`),
                  x: state.anchor.value.x,
                  y: state.anchor.value.y,
                })
              }}
            </p>
            <a-button :disabled="state.busy.value" @click="state.selectAnchor()">{{
              t('proto.anchorRemove')
            }}</a-button>
          </template>
        </section>
        <label for="review-feedback-text">{{
          t(state.selectedId.value ? 'proto.feedbackReply' : 'proto.feedbackNew')
        }}</label>
        <template v-if="!state.isPublic.value">
          <a-radio-group
            v-model:value="state.visibility.value"
            :disabled="state.busy.value || !state.writable.value"
            :aria-label="t('proto.feedbackVisibility')"
          >
            <a-radio-button value="public">{{ t('proto.feedbackPublic') }}</a-radio-button>
            <a-radio-button value="internal">{{ t('proto.feedbackInternal') }}</a-radio-button>
          </a-radio-group>
          <a-alert
            v-if="state.visibility.value === 'internal'"
            type="warning"
            show-icon
            :message="t('proto.feedbackInternalHint')"
          />
        </template>
        <a-textarea
          id="review-feedback-text"
          v-model:value="state.text.value"
          :maxlength="4000"
          :auto-size="{ minRows: 4, maxRows: 10 }"
          :disabled="state.busy.value || (!state.isPublic.value && !state.writable.value)"
        />
        <p>{{ t('proto.feedbackPlainText') }}</p>
        <label for="review-feedback-image">{{ t('proto.feedbackImageSelect') }}</label>
        <input
          id="review-feedback-image"
          class="feedback-image-input"
          type="file"
          accept="image/png,image/jpeg"
          :disabled="state.busy.value || (!state.isPublic.value && !state.writable.value)"
          @change="selectImage"
        />
        <p>{{ t('proto.feedbackImageHint') }}</p>
        <template v-if="state.imageFile.value">
          <img
            v-if="state.imagePreview.value"
            class="feedback-image"
            :src="state.imagePreview.value"
            :alt="t('proto.feedbackImageDraftAlt')"
          />
          <a-button :disabled="state.busy.value" @click="state.selectImage()">{{
            t('proto.feedbackImageRemove')
          }}</a-button>
        </template>
        <a-button
          type="primary"
          :loading="state.busy.value"
          :disabled="!canSend || state.loading.value"
          @click="state.send"
          >{{ t('proto.feedbackSubmit') }}</a-button
        >
      </template>
      <a-button @click="emit('close')">{{ t('common.close') }}</a-button>
    </section>
  </a-drawer>
  <a-modal
    :open="!!pendingSelection"
    :title="t('proto.feedbackLeaveTitle')"
    :footer="null"
    width="min(480px, 100vw)"
    @cancel="pendingSelection = undefined"
  >
    <p>{{ t('proto.overviewLeaveHint') }}</p>
    <div class="feedback-status-actions">
      <a-button @click="pendingSelection = undefined">{{ t('common.cancel') }}</a-button>
      <a-button danger :disabled="blocked" @click="confirmSelection">{{
        t('proto.feedbackLeaveConfirm')
      }}</a-button>
    </div>
  </a-modal>
</template>
<style scoped>
.review-threads {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  overflow-wrap: anywhere;
}
.review-threads :deep(.ant-btn),
.review-threads :deep(.ant-radio-button-wrapper) {
  max-width: 100%;
  height: auto;
  min-height: 32px;
  white-space: normal;
}
.feedback-page,
.feedback-meta,
.feedback-context,
.feedback-status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.feedback-page {
  flex-direction: column;
  margin: 0;
}
.feedback-context {
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}
.feedback-page {
  flex: 1 1 12rem;
  min-width: 0;
}
.feedback-task-heading,
.feedback-conversation {
  margin: 0;
}
.feedback-task-heading:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: var(--space-1);
}
.feedback-assignment {
  gap: var(--space-2);
  padding-block: var(--space-3);
  border-block: 1px solid var(--color-border);
}
.feedback-assignment p {
  margin: 0;
}
.feedback-threads,
.feedback-messages {
  padding: 0;
  margin: 0;
  list-style: none;
  display: grid;
  gap: var(--space-3);
}
.feedback-threads li,
.feedback-messages li {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: var(--space-3);
}
.feedback-thread {
  width: 100%;
  text-align: start;
  margin-bottom: var(--space-2);
}
.feedback-text {
  white-space: pre-wrap;
  margin: var(--space-2) 0 0;
}
.feedback-internal {
  border-inline-start: 3px solid var(--color-border);
}
.feedback-pagination {
  display: flex;
  justify-content: flex-end;
}
.feedback-assignment,
.feedback-assignment > .stack {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
}
.feedback-image-input,
.feedback-image {
  display: block;
  max-width: 100%;
  min-width: 0;
}
.feedback-image-input {
  width: 100%;
}
.feedback-image {
  height: auto;
  max-height: 60vh;
  object-fit: contain;
  margin-block: var(--space-2);
}
</style>
