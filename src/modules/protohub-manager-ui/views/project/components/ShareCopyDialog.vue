<script setup lang="ts">
import {
  Modal as AModal,
  Form as AForm,
  FormItem as AFormItem,
  InputPassword as AInputPassword,
  Textarea as ATextarea,
  Alert as AAlert,
  Button as AButton,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { ref, watch, nextTick } from 'vue'
const props = defineProps({
  open: { type: Boolean, default: false },
  password: { type: String, default: '' },
  verified: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  content: { type: String, default: '' },
  objectLabel: { type: String, default: '' },
  link: { type: String, default: '' },
})
const emit = defineEmits<{
  close: []
  'update:password': [value: string]
  verify: []
  copy: [event: MouseEvent]
}>()
const { t } = useI18n()
const copyResult = ref<HTMLElement>()
watch(
  () => props.verified,
  async (verified) => {
    if (!verified) return
    await nextTick()
    copyResult.value?.querySelector('button')?.focus()
  },
)
</script>
<template>
  <a-modal
    :open="open"
    :title="t('proto.copyShare')"
    :footer="null"
    destroy-on-close
    :mask-closable="false"
    wrap-class-name="share-copy-modal"
    @cancel="emit('close')"
  >
    <p v-if="objectLabel" class="copy-object">{{ objectLabel }}</p>
    <a-form
      v-if="!verified"
      name="share-copy"
      :model="{ password }"
      layout="vertical"
      @submit.prevent="emit('verify')"
    >
      <p class="copy-hint">{{ t('proto.sharePasswordCopyHint') }}</p>
      <a-form-item name="password" :label="t('proto.password')">
        <a-input-password
          :value="props.password"
          autocomplete="off"
          :placeholder="t('proto.passwordRequired')"
          @update:value="emit('update:password', $event)"
        />
      </a-form-item>
      <a-button type="primary" html-type="submit" :loading="busy">{{
        t('proto.verifySharePassword')
      }}</a-button>
    </a-form>
    <div v-else ref="copyResult" class="stack">
      <p class="copy-hint">{{ t('proto.shareCopyReadyHint') }}</p>
      <a-textarea
        :value="content"
        :aria-label="t('proto.shareCopyContent')"
        readonly
        :auto-size="{ minRows: 2, maxRows: 6 }"
      />
      <a-button type="primary" @click="emit('copy', $event)">{{ t('common.copy') }}</a-button>
    </div>
    <a
      v-if="link"
      class="copy-customer-link"
      :href="link"
      target="_blank"
      rel="noopener noreferrer"
      >{{ t('proto.shareOpenCustomer') }}</a
    >
    <a-alert v-if="error" role="alert" class="copy-error" type="error" :message="error" />
  </a-modal>
</template>
<style scoped>
.copy-object {
  font-weight: 600;
  overflow-wrap: anywhere;
  margin-top: 0;
}
.copy-hint {
  color: var(--color-muted);
  line-height: 1.6;
  margin-top: 0;
}
.copy-customer-link {
  display: inline-block;
  margin-top: var(--space-4);
}
:global(.share-copy-modal .ant-modal-body) {
  max-height: calc(100dvh - 13rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}
@media (max-width: 767px) {
  :global(.share-copy-modal .ant-modal) {
    top: var(--space-2);
    max-width: calc(100vw - 16px);
    margin: 0 auto;
    padding-bottom: 0;
  }
  :global(.share-copy-modal .ant-modal-body) {
    max-height: calc(100dvh - 6rem);
  }
}
.copy-error {
  margin-top: var(--space-3);
}
</style>
