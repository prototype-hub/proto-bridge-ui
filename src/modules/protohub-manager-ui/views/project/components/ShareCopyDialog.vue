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
const props = defineProps({
  open: { type: Boolean, default: false },
  password: { type: String, default: '' },
  verified: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  content: { type: String, default: '' },
})
const emit = defineEmits<{
  close: []
  'update:password': [value: string]
  verify: []
  copy: [event: MouseEvent]
}>()
const { t } = useI18n()
</script>
<template>
  <a-modal
    :open="open"
    :title="t('proto.copyShare')"
    :footer="null"
    destroy-on-close
    @cancel="emit('close')"
  >
    <a-form
      v-if="!verified"
      name="share-copy"
      :model="{ password }"
      layout="vertical"
      @submit.prevent="emit('verify')"
    >
      <p>{{ t('proto.sharePasswordCopyHint') }}</p>
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
    <div v-else class="stack">
      <a-textarea
        :value="content"
        :aria-label="t('proto.shareCopyContent')"
        readonly
        :auto-size="{ minRows: 2, maxRows: 6 }"
      />
      <a-button type="primary" @click="emit('copy', $event)">{{ t('common.copy') }}</a-button>
    </div>
    <a-alert v-if="error" class="copy-error" type="error" :message="error" />
  </a-modal>
</template>
<style scoped>
.copy-error {
  margin-top: var(--space-3);
}
</style>
