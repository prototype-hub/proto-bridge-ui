<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import dayjs, { type Dayjs } from 'dayjs'
import {
  FormItem as AFormItem,
  Textarea as ATextarea,
  DatePicker as ADatePicker,
  Select as ASelect,
  InputPassword as AInputPassword,
  RadioGroup as ARadioGroup,
  RadioButton as ARadioButton,
  Alert as AAlert,
  Button as AButton,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import FormModal from '@/shared/components/FormModal.vue'
import { useRevisions } from '../hooks/useRevisions'
import type {
  Share,
  ShareRevisionMode,
  SharePasswordAction,
  ShareUpdate,
  Version,
} from '@/modules/protohub-manager-ui/types'

const props = defineProps<{ share?: Share; version?: Version; busy: boolean; error: string }>()
const emit = defineEmits<{ close: []; save: [input: ShareUpdate] }>()
const { t } = useI18n()
const description = ref('')
const expires = ref<Dayjs>()
const mode = ref<ShareRevisionMode>('fixed')
const revisionId = ref('')
const passwordAction = ref<SharePasswordAction>('keep')
const password = ref('')
const open = computed(() => !!props.share)
const history = useRevisions(toRef(props, 'version'), open)
const revisionOptions = computed(() => {
  const rows = history.rows.value.map((row) => ({
    value: row.id,
    label: `${dayjs(row.createdAt).format('YYYY-MM-DD HH:mm:ss')} · ${row.versionName} · ${row.id}`,
  }))
  for (const id of [props.share?.revisionId, props.version?.currentRevisionId])
    if (id && !rows.some((row) => row.value === id)) rows.unshift({ value: id, label: id })
  return rows
})
watch(
  () => props.share,
  (share) => {
    description.value = share?.description || ''
    expires.value = share?.expiresAt == null ? undefined : dayjs(share.expiresAt)
    mode.value = share?.revisionMode || 'fixed'
    revisionId.value = share?.revisionId || props.version?.currentRevisionId || ''
    passwordAction.value = 'keep'
    password.value = ''
  },
  { immediate: true, flush: 'sync' },
)
watch(passwordAction, () => {
  password.value = ''
})
function save() {
  const share = props.share
  if (!share || props.busy || share.revoked) return
  emit('save', {
    expectedVersion: share.configVersion,
    description: description.value.trim() || null,
    expiresAt: expires.value?.valueOf() ?? null,
    revisionMode: mode.value,
    revisionId: mode.value === 'fixed' ? revisionId.value : undefined,
    passwordAction: passwordAction.value,
    password: passwordAction.value === 'replace' ? password.value : undefined,
  })
}
</script>
<template>
  <form-modal
    :open="open"
    :title="t('proto.editShare')"
    :model="{ description, expires, mode, revisionId, passwordAction, password }"
    :busy="busy"
    :error="error"
    :width="640"
    form-name="share-edit"
    @cancel="emit('close')"
    @submit="save"
  >
    <a-alert class="share-edit-hint" type="info" show-icon :message="t('proto.shareEditHint')" />
    <a-form-item name="description" :label="t('proto.shareDescription')">
      <a-textarea v-model:value="description" :maxlength="2000" :rows="2" show-count />
    </a-form-item>
    <a-form-item name="mode" :label="t('proto.shareRevisionMode')">
      <a-radio-group v-model:value="mode"
        ><a-radio-button value="fixed">{{ t('proto.shareFixed') }}</a-radio-button
        ><a-radio-button value="latest">{{ t('proto.shareLatest') }}</a-radio-button></a-radio-group
      >
    </a-form-item>
    <a-form-item
      v-if="mode === 'fixed'"
      name="revisionId"
      :label="t('proto.revision')"
      :rules="[{ required: true, message: t('common.required') }]"
    >
      <a-select
        v-model:value="revisionId"
        :options="revisionOptions"
        :loading="history.loading.value"
      />
      <a-alert v-if="history.error.value" type="error" :message="history.error.value" />
      <a-button
        v-if="history.error.value || history.hasMore.value"
        size="small"
        :loading="history.loading.value"
        @click="history.load(!history.error.value)"
        >{{ t(history.error.value ? 'common.retry' : 'proto.loadMoreRevisions') }}</a-button
      >
    </a-form-item>
    <a-form-item name="expires" :label="t('proto.expiresAt')">
      <a-date-picker
        v-model:value="expires"
        show-time
        :disabled-date="(date) => date.endOf('day').valueOf() < Date.now()"
        class="share-edit-expiry"
      />
    </a-form-item>
    <a-form-item name="passwordAction" :label="t('proto.passwordPolicy')">
      <a-select
        v-model:value="passwordAction"
        :options="
          (['keep', 'replace', 'remove'] as const).map((value) => ({
            value,
            label: t(`proto.passwordActions.${value}`),
          }))
        "
      />
    </a-form-item>
    <a-form-item
      v-if="passwordAction === 'replace'"
      name="password"
      :label="t('proto.password')"
      :rules="[{ required: true, message: t('proto.passwordRequired') }]"
    >
      <a-input-password v-model:value="password" autocomplete="new-password" />
    </a-form-item>
  </form-modal>
</template>
<style scoped>
.share-edit-hint {
  margin-bottom: var(--space-4);
}
.share-edit-expiry {
  width: 100%;
}
</style>
