<script setup lang="ts">
import { computed } from 'vue'
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
}>()
const emit = defineEmits<{ close: []; invitationUsed: []; abandonInvitation: []; feedback: [] }>()
const { t } = useI18n()
const state = props.state
const session = computed(() => state.context.value?.session)
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
      class="stack review-identity"
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.reviewIdentity')"
    >
      <p>{{ t('proto.reviewIdentityHint') }}</p>
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
          class="review-invitation-abandon"
          :disabled="state.busy.value || state.loading.value"
          @click="emit('abandonInvitation')"
          >{{ t('proto.reviewInvitationAbandon') }}</a-button
        >
      </template>
      <a-alert v-if="state.error.value" type="error" show-icon :message="state.error.value" />
      <a-alert
        v-if="state.expired.value"
        type="warning"
        show-icon
        :message="t('proto.reviewExpired')"
      />
      <load-state :loading="state.loading.value">
        <template v-if="session">
          <a-tag :color="session.verificationLevel === 'email' ? 'green' : 'warning'">{{
            t(
              session.verificationLevel === 'email'
                ? 'proto.reviewEmailVerified'
                : 'proto.reviewUnverified',
            )
          }}</a-tag>
          <a-alert
            v-if="session.verificationLevel === 'unverified'"
            type="warning"
            show-icon
            :message="t('proto.reviewUnverifiedHint')"
          />
          <p>{{ session.displayName }}</p>
          <p v-if="session.company">{{ session.company }}</p>
          <p v-if="session.maskedEmail">{{ session.maskedEmail }}</p>
          <p>
            {{ t('proto.reviewExpires', { time: new Date(session.expiresAt).toLocaleString() }) }}
          </p>
          <a-button :loading="state.busy.value" @click="state.logout">{{
            t('proto.reviewLogout')
          }}</a-button>
        </template>
        <template v-else-if="state.context.value">
          <div
            v-if="invitation === undefined && state.context.value.allowUnverified === true"
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
            <a-form-item
              v-if="state.mode.value === 'email'"
              name="email"
              :label="t('proto.reviewEmail')"
              :rules="[
                { required: true, type: 'email', message: t('proto.reviewProfileRequired') },
              ]"
            >
              <a-input
                v-model:value="state.form.email"
                type="email"
                autocomplete="email"
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
              html-type="submit"
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
            <template v-if="state.challenge.value">
              <p>{{ t('proto.reviewCodeSent') }}</p>
              <p v-if="state.now.value < state.challenge.value.resendAfter">
                {{
                  t('proto.reviewResendWait', {
                    seconds: Math.ceil(
                      (state.challenge.value.resendAfter - state.now.value) / 1000,
                    ),
                  })
                }}
              </p>
              <a-form-item name="code" :label="t('proto.reviewCode')">
                <a-input
                  v-model:value="state.form.code"
                  inputmode="numeric"
                  autocomplete="one-time-code"
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
                type="primary"
                :loading="state.busy.value"
                :disabled="!state.canVerify.value"
                @click="verify"
                >{{ t('proto.reviewVerify') }}</a-button
              >
            </template>
          </a-form>
        </template>
        <a-button v-if="!state.context.value" :disabled="state.busy.value" @click="state.load">{{
          t('common.retry')
        }}</a-button>
      </load-state>
      <a-button
        v-if="returnToFeedback"
        class="review-invitation-abandon"
        @click="emit('feedback')"
        >{{ t('proto.feedbackReturn') }}</a-button
      >
      <a-button @click="emit('close')">{{ t('common.close') }}</a-button>
    </section>
  </a-drawer>
</template>
<style scoped>
.review-identity {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  overflow-wrap: anywhere;
}
.review-identity-modes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.review-invitation-abandon,
.review-identity-modes :deep(.ant-btn) {
  max-width: 100%;
  height: auto;
  min-height: 32px;
  white-space: normal;
}
</style>
