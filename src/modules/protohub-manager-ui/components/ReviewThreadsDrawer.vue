<script setup lang="ts">
import { computed } from 'vue'
import {
  Drawer as ADrawer,
  Button as AButton,
  Alert as AAlert,
  Tag as ATag,
  Textarea as ATextarea,
  Pagination as APagination,
  RadioGroup as ARadioGroup,
  RadioButton as ARadioButton,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import LoadState from '@/shared/components/LoadState.vue'
import type { ReviewPage } from '../types'
import type { ReviewThreadsController } from '../hooks/useReviewThreads'
const props = defineProps<{
  open: boolean
  page?: ReviewPage
  state: ReviewThreadsController
  identityLoading?: boolean
}>()
const emit = defineEmits<{ close: []; authenticate: []; copyThread: [event: MouseEvent] }>()
const { t } = useI18n()
const state = props.state
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
    :title="t('proto.feedback')"
    width="min(600px, 100vw)"
    @close="emit('close')"
  >
    <section
      class="stack review-threads"
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.feedback')"
    >
      <a-alert type="info" show-icon :message="t('proto.feedbackPageHint')" />
      <p class="feedback-page">
        <strong>{{ page?.name }}</strong
        ><span>{{ page?.path }}</span>
      </p>
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
      <template v-if="state.readable.value">
        <a-radio-group
          :value="state.filter.value"
          :disabled="state.busy.value"
          :aria-label="t('proto.feedbackState')"
          @update:value="state.changeFilter"
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
          <load-state :empty="state.threads.value.length === 0">
            <ul class="feedback-threads">
              <li v-for="thread in state.threads.value" :key="thread.id">
                <a-button
                  class="feedback-thread"
                  :aria-pressed="thread.id === state.selectedId.value"
                  :disabled="state.busy.value"
                  @click="state.choose(thread)"
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
            :disabled="state.busy.value"
            simple
            @change="state.page"
          />
          <a-button
            v-if="state.isPublic.value"
            :disabled="state.busy.value"
            @click="state.choose()"
            >{{ t('proto.feedbackNew') }}</a-button
          >
          <template v-if="state.selected.value">
            <h3>{{ state.selected.value.summary }}</h3>
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
          (!state.targeted.value || state.selected.value) &&
          (state.isPublic.value || state.selectedId.value)
        "
      >
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
        <template v-if="state.selectedId.value">
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
        </template>
        <p v-else>{{ t('proto.feedbackImageThreadRequired') }}</p>
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
.feedback-status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.feedback-page {
  flex-direction: column;
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
