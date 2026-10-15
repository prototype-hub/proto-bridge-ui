<script setup lang="ts">
import { computed, useId, watch } from 'vue'
import {
  Button as AButton,
  FormItem as AFormItem,
  InputPassword as AInputPassword,
  Space as ASpace,
  Steps as ASteps,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { usePasswordChange } from '@/modules/authentication-manager-ui/views/account/hooks/usePasswordChange'
import FormModal from '@/shared/components/FormModal.vue'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; completed: [] }>()
const { t } = useI18n()
const state = usePasswordChange(() => emit('completed'))
const id = useId()
const label = computed(() =>
  t(`system.${['oldPassword', 'newPassword', 'confirmPassword'][state.step.value]}`),
)
const fieldName = computed(
  () => ['oldPassword', 'newPassword', 'confirmPassword'][state.step.value]!,
)
const inputId = computed(() => `${id}-${fieldName.value}`)
const value = computed(() => state.draft.value[fieldName.value as keyof typeof state.draft.value])
watch(() => props.open, state.reset, { immediate: true, flush: 'sync' })
function update(value: string) {
  if (state.busy.value) return
  if (state.step.value === 0) state.setOldPassword(value)
  else if (state.step.value === 1) state.setNewPassword(value)
  else state.setConfirmation(value)
}
function cancel() {
  if (state.writing.value) return
  state.reset()
  emit('update:open', false)
}
function proceed() {
  if (state.step.value === 2) void state.submit()
  else void state.next()
}
</script>
<template>
  <form-modal
    :open="open || state.writing.value"
    :title="t('system.changePassword')"
    :model="state.draft.value"
    :busy="state.busy.value"
    :error="state.error.value"
    :width="560"
    :closable="!state.writing.value"
    :keyboard="!state.writing.value"
    form-name="account-password"
    @cancel="cancel"
    @submit="proceed"
  >
    <a-steps
      :current="state.step.value"
      size="small"
      :items="[
        { title: t('accountPassword.verifyOld') },
        { title: t('accountPassword.setNew') },
        { title: t('accountPassword.confirmNew') },
      ]"
    />
    <a-form-item :key="fieldName" :label="label" :html-for="inputId" class="password-step-field">
      <a-input-password
        :id="inputId"
        :value="value"
        :disabled="state.busy.value"
        :autocomplete="state.step.value === 0 ? 'current-password' : 'new-password'"
        @update:value="update"
      />
    </a-form-item>
    <p v-if="state.step.value === 1" class="password-step-hint">{{ t('accountPassword.rule') }}</p>
    <template #footer>
      <a-space class="password-step-actions">
        <a-button :disabled="state.writing.value" @click="cancel">{{
          t('common.cancel')
        }}</a-button>
        <a-button v-if="state.step.value > 0" :disabled="state.busy.value" @click="state.back">{{
          t('accountPassword.previous')
        }}</a-button>
        <a-button
          type="primary"
          html-type="submit"
          :loading="state.busy.value"
          :disabled="state.busy.value"
          >{{ t(state.step.value === 2 ? 'common.save' : 'accountPassword.next') }}</a-button
        >
      </a-space>
    </template>
  </form-modal>
</template>
<style scoped>
.password-step-field {
  margin-top: var(--space-6);
}
.password-step-hint {
  color: var(--color-text-secondary);
}
.password-step-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
