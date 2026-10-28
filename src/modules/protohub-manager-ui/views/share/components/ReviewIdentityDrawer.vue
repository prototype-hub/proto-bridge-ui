<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  Drawer as ADrawer,
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  Button as AButton,
  Alert as AAlert,
  Tag as ATag,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import LoadState from '@/shared/components/LoadState.vue'
import type { ReviewIdentityController } from '../hooks/useReviewIdentity'

const props = defineProps<{
  state: ReviewIdentityController
  open: boolean
  invitation?: string | null
  returnToFeedback?: boolean
  returnToOverview?: boolean
}>()
const emit = defineEmits<{ close: []; invitationUsed: []; abandonInvitation: []; feedback: [] }>()
const { t } = useI18n()
const state = props.state
const session = computed(() => state.context.value?.session)
const codeInput = ref<{ focus: () => void }>()
const emailInput = ref<{ focus: () => void }>()
// New codes lead to the code field without changing identity or draft ownership.
watch(
  () => state.challenge.value?.challengeId,
  async (id) => {
    if (id) {
      await nextTick()
      codeInput.value?.focus()
    }
  },
)
async function editProfile() {
  state.challenge.value = undefined
  state.form.code = ''
  await nextTick()
  emailInput.value?.focus()
}
async function verify() {
  if (await state.verify()) emit('invitationUsed')
}
</script>
<template>
  <a-drawer
    :open="open"
    :title="t('proto.reviewIdentity')"
    width="min(480px, 100vw)"
    @close="emit('close')"
  >
    <section
      class="review-identity"
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.reviewIdentity')"
    >
      <template v-if="invitation !== undefined">
        <a-alert
          :type="invitation === null ? 'error' : 'info'"
          show-icon
          :message="
            t(
              invitation === null
                ? 'proto.reviewInvitationInvalid'
                : session
                  ? 'proto.reviewInvitationLogoutFirst'
                  : 'proto.reviewInvitationRecipientHint',
            )
          "
        />
        <a-button
          class="identity-secondary"
          :disabled="state.busy.value || state.loading.value"
          @click="emit('abandonInvitation')"
          >{{ t('proto.reviewInvitationAbandon') }}</a-button
        >
      </template>
      <a-alert
        v-if="state.error.value"
        type="error"
        show-icon
        :message="state.error.value"
        role="alert"
      />
      <a-alert
        v-if="state.expired.value"
        type="warning"
        show-icon
        :message="t('proto.reviewExpired')"
      />
      <load-state :loading="state.loading.value">
        <template v-if="session">
          <div class="identity-heading">
            <h2>{{ t('proto.reviewIdentityReady') }}</h2>
            <a-tag :color="session.verificationLevel === 'email' ? 'green' : 'warning'">{{
              t(
                session.verificationLevel === 'email'
                  ? 'proto.reviewEmailVerified'
                  : 'proto.reviewUnverified',
              )
            }}</a-tag>
          </div>
          <h3 class="identity-name">{{ session.displayName }}</h3>
          <dl class="identity-summary">
            <template v-if="session.maskedEmail"
              ><dt>{{ t('proto.reviewEmail') }}</dt>
              <dd>{{ session.maskedEmail }}</dd></template
            >
            <template v-if="session.company"
              ><dt>{{ t('proto.reviewCompany') }}</dt>
              <dd>{{ session.company }}</dd></template
            >
          </dl>
          <p class="muted identity-expiry">
            {{ t('proto.reviewExpires', { time: new Date(session.expiresAt).toLocaleString() }) }}
          </p>
          <a-alert
            v-if="session.verificationLevel === 'unverified'"
            type="warning"
            show-icon
            :message="t('proto.reviewUnverifiedHint')"
          />
          <a-button
            class="identity-secondary"
            type="text"
            :loading="state.busy.value"
            @click="state.logout"
            >{{ t('proto.reviewLogout') }}</a-button
          >
        </template>
        <template v-else-if="state.context.value">
          <div class="identity-heading">
            <h2>
              {{
                t(state.challenge.value ? 'proto.reviewChallengeTitle' : 'proto.reviewProfileTitle')
              }}
            </h2>
            <p v-if="!state.challenge.value && state.mode.value === 'email'" class="muted">
              {{ t('proto.reviewProfileIntro') }}
            </p>
          </div>
          <div
            v-if="
              !state.challenge.value &&
              invitation === undefined &&
              state.context.value.allowUnverified === true
            "
            class="review-identity-modes"
            role="group"
            :aria-label="t('proto.reviewIdentityMethod')"
          >
            <a-button
              :type="state.mode.value === 'email' ? 'primary' : 'default'"
              :aria-pressed="state.mode.value === 'email'"
              :disabled="state.busy.value"
              @click="state.chooseMode('email')"
              >{{ t('proto.reviewUseEmail') }}</a-button
            >
            <a-button
              :type="state.mode.value === 'unverified' ? 'primary' : 'default'"
              :aria-pressed="state.mode.value === 'unverified'"
              :disabled="state.busy.value"
              @click="state.chooseMode('unverified')"
              >{{ t('proto.reviewUseUnverified') }}</a-button
            >
          </div>
          <a-alert
            v-if="state.mode.value === 'unverified'"
            type="warning"
            show-icon
            :message="t('proto.reviewUnverifiedHint')"
          />
          <a-alert
            v-else-if="!state.context.value.mailAvailable"
            type="warning"
            show-icon
            :message="t('proto.reviewMailUnavailable')"
          />
          <a-form
            v-if="state.mode.value === 'unverified' || state.context.value.mailAvailable"
            layout="vertical"
            :model="state.form"
            @finish="state.mode.value === 'email' ? state.send() : state.createUnverified()"
          >
            <template v-if="!state.challenge.value">
              <a-form-item
                v-if="state.mode.value === 'email'"
                name="email"
                :label="t('proto.reviewEmail')"
                :rules="[
                  { required: true, type: 'email', message: t('proto.reviewProfileRequired') },
                ]"
              >
                <a-input
                  ref="emailInput"
                  v-model:value="state.form.email"
                  type="email"
                  autocomplete="email"
                  :spellcheck="false"
                  :maxlength="254"
                  :disabled="state.busy.value"
                />
              </a-form-item>
              <a-form-item
                name="displayName"
                :label="t('proto.reviewName')"
                :rules="[
                  { required: true, whitespace: true, message: t('proto.reviewNameRequired') },
                ]"
              >
                <a-input
                  v-model:value="state.form.displayName"
                  autocomplete="name"
                  :maxlength="100"
                  :disabled="state.busy.value"
                />
              </a-form-item>
              <a-form-item name="company" :label="t('proto.reviewCompany')">
                <a-input
                  v-model:value="state.form.company"
                  autocomplete="organization"
                  :maxlength="200"
                  :disabled="state.busy.value"
                />
              </a-form-item>
              <a-button
                class="identity-primary"
                type="primary"
                html-type="submit"
                block
                :loading="state.busy.value"
                :disabled="
                  state.mode.value === 'email'
                    ? !state.canSend.value
                    : !state.canCreateUnverified.value
                "
                >{{
                  t(
                    state.mode.value === 'email'
                      ? 'proto.reviewSendCode'
                      : 'proto.reviewCreateUnverified',
                  )
                }}</a-button
              >
            </template>
            <section v-else class="identity-challenge">
              <p class="identity-recipient">
                {{ t('proto.reviewChallengeRecipient', { email: state.form.email }) }}
              </p>
              <p class="muted">{{ t('proto.reviewCodeSent') }}</p>
              <a-form-item name="code" :label="t('proto.reviewCode')">
                <a-input
                  ref="codeInput"
                  v-model:value="state.form.code"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  :spellcheck="false"
                  :maxlength="6"
                  :disabled="state.busy.value"
                  @press-enter.prevent="verify"
                />
              </a-form-item>
              <a-alert
                v-if="state.now.value >= state.challenge.value.expiresAt"
                type="warning"
                :message="t('proto.reviewCodeExpired')"
              />
              <a-button
                class="identity-primary"
                type="primary"
                block
                :loading="state.busy.value"
                :disabled="!state.canVerify.value"
                @click="verify"
                >{{ t('proto.reviewVerify') }}</a-button
              >
              <div class="identity-code-actions">
                <a-button
                  type="link"
                  :disabled="!state.canSend.value"
                  :loading="state.busy.value"
                  @click="state.send"
                  >{{ t('proto.reviewSendCode') }}</a-button
                >
                <a-button type="text" :disabled="state.busy.value" @click="editProfile">{{
                  t('proto.reviewEditProfile')
                }}</a-button>
              </div>
              <p
                v-if="state.now.value < state.challenge.value.resendAfter"
                class="muted identity-countdown"
                role="status"
              >
                {{
                  t('proto.reviewResendWait', {
                    seconds: Math.ceil(
                      (state.challenge.value.resendAfter - state.now.value) / 1000,
                    ),
                  })
                }}
              </p>
            </section>
          </a-form>
        </template>
        <a-button v-if="!state.context.value" :disabled="state.busy.value" @click="state.load">{{
          t('common.retry')
        }}</a-button>
      </load-state>
      <details class="identity-help">
        <summary>{{ t('proto.reviewIdentityHelp') }}</summary>
        <p>{{ t('proto.reviewIdentityHint') }}</p>
      </details>
      <footer class="identity-footer">
        <a-button
          v-if="returnToFeedback"
          :type="session ? 'primary' : 'default'"
          @click="emit('feedback')"
          >{{ t(returnToOverview ? 'proto.overviewReturn' : 'proto.feedbackReturn') }}</a-button
        >
        <a-button
          :type="session && !returnToFeedback ? 'primary' : 'text'"
          @click="emit('close')"
          >{{ t('common.close') }}</a-button
        >
      </footer>
    </section>
  </a-drawer>
</template>
<style scoped>
.review-identity {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
  overflow-wrap: anywhere;
}
.identity-heading {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}
.identity-heading h2 {
  margin: 0;
  font-size: var(--text-title);
  line-height: 1.4;
}
.identity-heading p,
.identity-challenge p,
.identity-help p {
  margin: 0;
  line-height: 1.6;
}
.identity-name {
  margin: 0;
  font-size: var(--text-title);
  line-height: 1.5;
}
.identity-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2) var(--space-4);
  margin: 0;
}
.identity-summary dt {
  color: var(--color-muted);
}
.identity-summary dd {
  margin: 0;
}
.identity-expiry {
  margin: 0;
  font-size: var(--text-small);
}
.review-identity-modes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding-bottom: var(--space-2);
}
.review-identity-modes :deep(.ant-btn),
.identity-secondary,
.identity-code-actions :deep(.ant-btn),
.identity-footer :deep(.ant-btn) {
  max-width: 100%;
  height: auto;
  min-height: 32px;
  white-space: normal;
}
.identity-secondary {
  align-self: flex-start;
}
.identity-challenge {
  display: grid;
  gap: var(--space-4);
}
.identity-recipient {
  font-weight: 600;
}
.identity-code-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2);
}
.identity-code-actions :deep(.ant-btn) {
  padding-inline: 0;
}
.identity-countdown {
  font-size: var(--text-small);
  font-variant-numeric: tabular-nums;
}
.identity-help {
  color: var(--color-muted);
  font-size: var(--text-small);
  line-height: 1.6;
}
.identity-help summary {
  width: fit-content;
  padding-block: var(--space-1);
  cursor: pointer;
}
.identity-help p {
  padding-top: var(--space-2);
}
.identity-help summary:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.identity-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}
.identity-primary {
  height: auto;
  min-height: 36px;
  white-space: normal;
}
</style>
