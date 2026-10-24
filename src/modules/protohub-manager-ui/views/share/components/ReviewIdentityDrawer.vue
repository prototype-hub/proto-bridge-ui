<script setup lang="ts">
import { computed, toRef } from 'vue'
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
import { useReviewIdentity } from '../hooks/useReviewIdentity'
import type { PublicShare } from '@/modules/protohub-manager-ui/types'

const props = defineProps<{ share?: PublicShare; open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const state = useReviewIdentity(toRef(props, 'share'), toRef(props, 'open'))
const session = computed(() => state.context.value?.session)
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
      <a-alert v-if="state.error.value" type="error" show-icon :message="state.error.value" />
      <a-alert
        v-if="state.expired.value"
        type="warning"
        show-icon
        :message="t('proto.reviewExpired')"
      />
      <load-state :loading="state.loading.value">
        <template v-if="session">
          <a-tag color="green">{{ t('proto.reviewEmailVerified') }}</a-tag>
          <p>{{ session.displayName }}</p>
          <p v-if="session.company">{{ session.company }}</p>
          <p>{{ session.maskedEmail }}</p>
          <p>
            {{ t('proto.reviewExpires', { time: new Date(session.expiresAt).toLocaleString() }) }}
          </p>
          <a-button :loading="state.busy.value" @click="state.logout">{{
            t('proto.reviewLogout')
          }}</a-button>
        </template>
        <a-form
          v-else-if="state.context.value?.mailAvailable"
          layout="vertical"
          :model="state.form"
          @finish="state.send"
        >
          <a-form-item
            name="email"
            :label="t('proto.reviewEmail')"
            :rules="[{ required: true, type: 'email', message: t('proto.reviewProfileRequired') }]"
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
              { required: true, whitespace: true, message: t('proto.reviewProfileRequired') },
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
            :disabled="!state.canSend.value"
            >{{ t('proto.reviewSendCode') }}</a-button
          >
          <template v-if="state.challenge.value">
            <p>{{ t('proto.reviewCodeSent') }}</p>
            <p v-if="state.now.value < state.challenge.value.resendAfter">
              {{
                t('proto.reviewResendWait', {
                  seconds: Math.ceil((state.challenge.value.resendAfter - state.now.value) / 1000),
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
                @press-enter.prevent="state.verify"
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
              @click="state.verify"
              >{{ t('proto.reviewVerify') }}</a-button
            >
          </template>
        </a-form>
        <a-alert
          v-else-if="state.context.value"
          type="warning"
          show-icon
          :message="t('proto.reviewMailUnavailable')"
        />
        <a-button v-if="!state.context.value" :disabled="state.busy.value" @click="state.load">{{
          t('common.retry')
        }}</a-button>
      </load-state>
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
</style>
