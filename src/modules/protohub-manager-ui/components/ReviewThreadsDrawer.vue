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
import { ArrowLeftOutlined, PaperClipOutlined, ReloadOutlined } from '@ant-design/icons-vue'
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
const showComposer = computed(
  () =>
    mode.value === 'detail' &&
    (!state.targeted.value || !!state.selected.value) &&
    (state.isPublic.value || !!state.selectedId.value),
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
    :body-style="{ padding: 0 }"
    width="min(600px, 100vw)"
    @after-open-change="afterOpen"
    @close="emit('close')"
  >
    <section
      ref="content"
      class="review-threads"
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.feedback')"
      @keydown.esc="cancelPending"
    >
      <header class="feedback-context">
        <p class="feedback-page">
          <strong>{{ page?.name }}</strong
          ><span>{{ page?.path }}</span>
        </p>
        <a-button type="text" @click="emit('overview')">{{ t('proto.feedbackOverview') }}</a-button>
      </header>
      <div class="feedback-workspace">
        <details class="feedback-help">
          <summary>{{ t('proto.feedbackHelp') }}</summary>
          <div class="feedback-help-copy">
            <p>{{ t('proto.feedbackPageHint') }}</p>
            <p>{{ t('proto.anchorHint') }}</p>
            <p>{{ t('proto.anchorSnapshotHint') }}</p>
            <p>{{ t('proto.feedbackPlainText') }}</p>
            <p>{{ t('proto.feedbackImageHint') }}</p>
          </div>
        </details>
        <div
          v-if="
            state.isPublic.value &&
            (state.authenticationRequired.value || !state.policyEnabled.value)
          "
          class="feedback-access stack"
        >
          <a-alert
            v-if="!identityLoading"
            type="warning"
            show-icon
            :message="
              t(
                !state.policyEnabled.value
                  ? 'proto.feedbackDisabled'
                  : 'proto.feedbackAuthenticate',
              )
            "
          />
          <div class="feedback-status-actions">
            <a-button
              v-if="state.policyEnabled.value"
              :loading="identityLoading"
              @click="emit('authenticate')"
              >{{ t('proto.reviewIdentity') }}</a-button
            >
            <a-button v-if="state.text.value" @click="state.copyDraft">{{
              t('proto.feedbackCopyDraft')
            }}</a-button>
          </div>
        </div>
        <a-alert
          v-if="state.notice.value && !showComposer"
          type="warning"
          show-icon
          role="status"
          :message="state.notice.value"
        />
        <template v-if="mode === 'detail'">
          <nav class="feedback-navigation" :aria-label="t('proto.feedbackPageList')">
            <a-button type="text" @click="show('list')"
              ><template #icon><arrow-left-outlined aria-hidden="true" /></template
              >{{ t('proto.feedbackBackToList') }}</a-button
            >
            <a-button
              type="text"
              :disabled="state.busy.value || state.loading.value"
              @click="state.load"
              ><template #icon><reload-outlined aria-hidden="true" /></template
              >{{ t('common.refresh') }}</a-button
            >
          </nav>
          <div class="feedback-task-summary">
            <h3 ref="taskHeading" class="feedback-task-heading" tabindex="-1">
              {{
                state.selected.value?.summary ||
                t(state.selectedId.value ? 'proto.feedbackDetail' : 'proto.feedbackNew')
              }}
            </h3>
            <a-tag
              v-if="state.selected.value"
              :color="state.selected.value.state === 'open' ? 'processing' : 'success'"
              >{{
                t(
                  state.selected.value.state === 'open'
                    ? 'proto.feedbackOpen'
                    : 'proto.feedbackResolved',
                )
              }}</a-tag
            >
          </div>
        </template>
        <template v-else>
          <div class="feedback-section-heading">
            <h3 ref="listHeading" class="feedback-task-heading" tabindex="-1">
              {{ t('proto.feedbackPageList') }}
            </h3>
            <a-button
              v-if="state.isPublic.value"
              type="primary"
              :disabled="blocked && !!state.selectedId.value"
              @click="choose()"
              >{{ t('proto.feedbackNew') }}</a-button
            >
          </div>
          <a-button
            v-if="state.selectedId.value || guarded"
            class="feedback-resume"
            @click="show('detail')"
            >{{ t('proto.feedbackContinue') }}</a-button
          >
        </template>
        <div v-if="state.readable.value && mode === 'list'" class="feedback-list-toolbar">
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
          <a-button
            type="text"
            :disabled="state.busy.value || state.loading.value"
            @click="state.load"
            ><template #icon><reload-outlined aria-hidden="true" /></template
            >{{ t('common.refresh') }}</a-button
          >
        </div>
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
                      type="text"
                      :aria-pressed="thread.id === state.selectedId.value"
                      :disabled="blocked && thread.id !== state.selectedId.value"
                      @click="choose(thread)"
                      >{{ thread.summary }}</a-button
                    >
                    <div class="feedback-meta">
                      <span>{{ thread.authorName }}</span>
                      <time :datetime="new Date(thread.updatedAt).toISOString()">{{
                        new Date(thread.updatedAt).toLocaleString()
                      }}</time>
                      <a-tag>{{
                        t(
                          thread.verificationLevel === 'email'
                            ? 'proto.reviewEmailVerified'
                            : 'proto.reviewUnverified',
                        )
                      }}</a-tag>
                      <a-tag :color="thread.state === 'open' ? 'processing' : 'success'">{{
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
            </template>
            <template v-if="mode === 'detail' && state.selected.value">
              <div v-if="state.selected.value.anchor" class="feedback-anchor-link">
                <a-button
                  :disabled="state.busy.value || state.loading.value"
                  @click="emit('locateAnchor', state.selected.value.anchor)"
                  >{{ t('proto.anchorLocate') }}</a-button
                >
              </div>

              <div class="feedback-status-actions feedback-thread-actions">
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
              <section
                v-if="!state.isPublic.value"
                class="feedback-assignment"
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
                    <div class="feedback-status-actions feedback-assignment-actions">
                      <a-button
                        v-if="assignment.canEdit.value && !assignment.unknown.value"
                        type="link"
                        :disabled="assignment.busy.value"
                        @click="assignment.edit"
                        >{{ t('proto.assignmentEdit') }}</a-button
                      >
                      <details class="feedback-more">
                        <summary>{{ t('proto.feedbackMore') }}</summary>
                        <div class="feedback-more-actions">
                          <a-button :disabled="assignment.busy.value" @click="assignment.load">{{
                            t('proto.assignmentRefresh')
                          }}</a-button>
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
                      </details>
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
                    assignment.editing.value &&
                    assignment.canEdit.value &&
                    !assignment.unknown.value
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
              <div class="feedback-section-heading">
                <h4 class="feedback-conversation">{{ t('proto.feedbackConversation') }}</h4>
                <span class="feedback-muted">{{
                  t('proto.feedbackMessageCount', { count: state.messagesTotal.value })
                }}</span>
              </div>
              <ol class="feedback-messages">
                <li
                  v-for="message in state.messages.value"
                  :key="message.id"
                  :class="{ 'feedback-internal': message.visibility === 'internal' }"
                >
                  <div class="feedback-meta feedback-message-meta">
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
                    ><time :datetime="new Date(message.createdAt).toISOString()">{{
                      new Date(message.createdAt).toLocaleString()
                    }}</time>
                  </div>
                  <p class="feedback-text">{{ message.text }}</p>
                  <template v-if="message.image">
                    <p class="feedback-attachment-info">
                      {{ t('proto.feedbackImageInfo', { ...message.image }) }}
                    </p>
                    <a-button
                      :loading="
                        state.imageView.value?.messageId === message.id &&
                        state.imageView.value.loading
                      "
                      :aria-expanded="
                        state.imageView.value?.messageId === message.id &&
                        !!state.imageView.value.url
                      "
                      @click="state.viewImage(message)"
                      >{{
                        t(
                          state.imageView.value?.messageId === message.id &&
                            state.imageView.value.url
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
      </div>
      <section
        v-if="showComposer"
        class="feedback-composer"
        :aria-label="t(state.selectedId.value ? 'proto.feedbackReply' : 'proto.feedbackNew')"
      >
        <div class="feedback-composer-body">
          <div class="feedback-composer-heading">
            <label for="review-feedback-text">{{
              t(state.selectedId.value ? 'proto.feedbackReply' : 'proto.feedbackNew')
            }}</label>
            <a-radio-group
              v-if="!state.isPublic.value"
              v-model:value="state.visibility.value"
              :disabled="state.busy.value || !state.writable.value"
              :aria-label="t('proto.feedbackVisibility')"
              size="small"
            >
              <a-radio-button value="public">{{ t('proto.feedbackPublic') }}</a-radio-button>
              <a-radio-button value="internal">{{ t('proto.feedbackInternal') }}</a-radio-button>
            </a-radio-group>
          </div>
          <p v-if="!state.isPublic.value" class="feedback-visibility-note" role="status">
            {{
              t(
                state.visibility.value === 'internal'
                  ? 'proto.feedbackInternalHint'
                  : 'proto.feedbackPublicHint',
              )
            }}
          </p>
          <section
            v-if="state.isPublic.value && !state.selectedId.value"
            class="anchor-draft"
            :aria-label="t('proto.anchorTitle')"
          >
            <span class="feedback-muted">{{ t('proto.anchorTitle') }}</span>
            <div class="feedback-status-actions">
              <a-button
                v-for="shape in ['point', 'rect', 'ellipse'] as const"
                :key="shape"
                size="small"
                :disabled="state.busy.value"
                @click="emit('captureAnchor', shape)"
                >{{ t(`proto.anchor${shape}`) }}</a-button
              >
            </div>
            <div v-if="state.anchor.value" class="feedback-anchor-selected">
              <span role="status">{{
                t('proto.anchorAttached', { shape: t(`proto.anchor${state.anchor.value.shape}`) })
              }}</span>
              <a-button type="link" :disabled="state.busy.value" @click="state.selectAnchor()">{{
                t('proto.anchorRemove')
              }}</a-button>
            </div>
          </section>
          <a-textarea
            id="review-feedback-text"
            v-model:value="state.text.value"
            :maxlength="4000"
            :auto-size="{ minRows: 4, maxRows: 6 }"
            :placeholder="t('proto.feedbackPlaceholder')"
            :disabled="state.busy.value || (!state.isPublic.value && !state.writable.value)"
          />
        </div>
        <div class="feedback-composer-tools">
          <a-alert
            v-if="state.notice.value"
            class="feedback-composer-notice"
            type="warning"
            show-icon
            role="status"
            :message="state.notice.value"
          />
          <label
            for="review-feedback-image"
            class="feedback-upload"
            :class="{
              'feedback-upload-disabled':
                state.busy.value || (!state.isPublic.value && !state.writable.value),
            }"
            ><paper-clip-outlined aria-hidden="true" />{{ t('proto.feedbackImageSelect') }}
            <input
              id="review-feedback-image"
              class="feedback-image-input"
              type="file"
              accept="image/png,image/jpeg"
              :disabled="state.busy.value || (!state.isPublic.value && !state.writable.value)"
              @change="selectImage"
            />
          </label>
          <div v-if="state.imageFile.value" class="feedback-image-draft">
            <img
              v-if="state.imagePreview.value"
              class="feedback-image"
              :src="state.imagePreview.value"
              :alt="t('proto.feedbackImageDraftAlt')"
            />
            <a-button type="text" :disabled="state.busy.value" @click="state.selectImage()">{{
              t('proto.feedbackImageRemove')
            }}</a-button>
          </div>
          <span class="feedback-character-count">{{ state.text.value.length }} / 4000</span>
          <a-button
            type="primary"
            :loading="state.busy.value"
            :disabled="!canSend || state.loading.value"
            @click="state.send"
            >{{ t('proto.feedbackSubmit') }}</a-button
          >
        </div>
      </section>
      <footer class="feedback-footer">
        <a-button type="text" @click="emit('close')">{{ t('common.close') }}</a-button>
      </footer>
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
  overflow-wrap: anywhere;
}
.review-threads :deep(.ant-btn),
.review-threads :deep(.ant-radio-button-wrapper) {
  max-width: 100%;
  height: auto;
  min-height: 32px;
  white-space: normal;
}
.feedback-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
}
.feedback-page {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
  margin: 0;
}
.feedback-page strong {
  font-size: var(--text-body);
}
.feedback-page span {
  color: var(--color-muted);
  font-size: var(--text-small);
}
.feedback-context > :deep(.ant-btn) {
  flex-shrink: 0;
}
.feedback-workspace {
  display: grid;
  align-content: start;
  gap: var(--space-4);
  min-width: 0;
  padding: var(--space-4) var(--space-6) var(--space-6);
}
.feedback-help {
  color: var(--color-muted);
  font-size: var(--text-small);
}
.feedback-help summary,
.feedback-more summary {
  cursor: pointer;
  width: fit-content;
  padding-block: var(--space-1);
}
.feedback-help-copy {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding: var(--space-3);
  background: var(--color-background);
  border-radius: var(--radius);
  line-height: 1.6;
}
.feedback-help-copy p {
  margin: 0;
}
.feedback-navigation,
.feedback-section-heading,
.feedback-list-toolbar,
.feedback-composer-heading,
.feedback-composer-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.feedback-navigation {
  margin-inline: calc(-1 * var(--space-3));
}
.feedback-task-summary {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}
.feedback-task-summary :deep(.ant-tag) {
  flex-shrink: 0;
  margin-top: var(--space-1);
}
.feedback-task-heading {
  margin: 0;
  font-size: 1.125rem;
  line-height: 1.5;
  font-weight: 600;
}
.feedback-task-summary .feedback-task-heading {
  flex: 1;
  min-width: 0;
}
.feedback-task-heading:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: var(--space-1);
}
.feedback-resume {
  justify-self: start;
}
.feedback-meta,
.feedback-status-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.feedback-meta {
  color: var(--color-muted);
  font-size: var(--text-small);
}
.feedback-meta :deep(.ant-tag) {
  margin: 0;
}
.feedback-thread-actions {
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.feedback-threads,
.feedback-messages {
  list-style: none;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.feedback-threads > li {
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--color-border);
  min-width: 0;
}
.feedback-threads > li:first-child {
  padding-top: 0;
}
.feedback-thread {
  display: block;
  width: 100%;
  text-align: start;
  font-weight: 600;
  padding: var(--space-2) 0;
  margin-bottom: var(--space-1);
}
.feedback-thread :deep(span) {
  white-space: normal;
}
.feedback-thread[aria-pressed='true'] {
  color: var(--color-primary);
}
.feedback-section-heading {
  margin-top: var(--space-2);
}
.feedback-conversation {
  margin: 0;
  font-size: var(--text-body);
  font-weight: 600;
}
.feedback-muted {
  color: var(--color-muted);
  font-size: var(--text-small);
}
.feedback-messages > li {
  padding-block: var(--space-4);
  border-bottom: 1px solid var(--color-border);
  min-width: 0;
}
.feedback-messages > li:last-child {
  border: 0;
  padding-bottom: 0;
}
.feedback-message-meta strong {
  color: var(--color-text);
  font-size: var(--text-body);
}
.feedback-message-meta time {
  flex-basis: 100%;
  font-variant-numeric: tabular-nums;
}
.feedback-text {
  white-space: pre-wrap;
  margin: var(--space-3) 0 0;
  line-height: 1.7;
}
.feedback-messages > .feedback-internal {
  margin-block: var(--space-3);
  padding: var(--space-4);
  background: var(--color-background);
  border: 0;
  border-radius: var(--radius);
}
.feedback-assignment {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3);
  background: var(--color-background);
  border-radius: var(--radius);
  font-size: var(--text-small);
}
.feedback-assignment > strong {
  color: var(--color-muted);
  font-weight: 400;
}
.feedback-assignment p {
  margin: 0;
}
.feedback-assignment-actions {
  margin-inline-start: auto;
}
.feedback-assignment > .stack,
.feedback-assignment > :deep(.ant-alert),
.feedback-assignment > .feedback-status-actions:not(.feedback-assignment-actions) {
  flex-basis: 100%;
  min-width: 0;
}
.feedback-assignment > .stack {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-3);
  gap: var(--space-2);
}
.feedback-more {
  position: relative;
}
.feedback-more-actions {
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-2);
}
.feedback-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-3);
}
.feedback-composer {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6);
  background: var(--color-background);
  border-top: 1px solid var(--color-border);
}
.feedback-composer-body {
  display: grid;
  gap: var(--space-3);
  min-height: 0;
}
.feedback-composer-tools {
  flex-shrink: 0;
}
.feedback-composer-notice {
  flex-basis: 100%;
  width: 100%;
}
.feedback-composer-heading > label {
  font-weight: 600;
}
.feedback-composer :deep(textarea) {
  caret-color: var(--color-primary);
}
.feedback-visibility-note {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-small);
}
.anchor-draft {
  display: grid;
  gap: var(--space-2);
}
.feedback-anchor-selected {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-size: var(--text-small);
}
.feedback-upload {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 36px;
  padding: var(--space-2) var(--space-3);
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  cursor: pointer;
}
.feedback-upload:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.feedback-upload:focus-within {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.feedback-upload-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.feedback-image-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: inherit;
}
.feedback-character-count {
  margin-inline-start: auto;
  color: var(--color-muted);
  font-size: var(--text-small);
  font-variant-numeric: tabular-nums;
}
.feedback-image {
  display: block;
  height: auto;
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
  margin-block: var(--space-2);
}
.feedback-image-draft {
  flex-basis: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}
.feedback-image-draft .feedback-image {
  width: auto;
  max-width: 50%;
  max-height: 4rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
.feedback-attachment-info {
  color: var(--color-muted);
  font-size: var(--text-small);
  margin: var(--space-3) 0 var(--space-2);
}
.feedback-footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-2) var(--space-6);
  border-top: 1px solid var(--color-border);
}
@media (width > 640px) and (height > 700px) {
  .review-threads {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .feedback-context,
  .feedback-composer,
  .feedback-footer {
    flex-shrink: 0;
  }
  .feedback-composer {
    max-height: 65%;
  }
  .feedback-composer-body {
    overflow-y: auto;
  }
  .feedback-workspace {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
}
@media (width <= 640px) {
  .feedback-context {
    align-items: flex-start;
    padding: var(--space-4);
  }
  .feedback-context > :deep(.ant-btn) {
    flex-shrink: 1;
  }
  .feedback-workspace,
  .feedback-composer {
    padding: var(--space-4);
  }
  .feedback-context,
  .feedback-composer-heading {
    gap: var(--space-2);
  }
  .feedback-composer-heading {
    align-items: flex-start;
  }
  .feedback-composer-tools {
    gap: var(--space-2);
  }
  .feedback-upload {
    font-size: var(--text-small);
  }
  .feedback-navigation :deep(.ant-btn) {
    padding-inline: var(--space-2);
  }
}
</style>
