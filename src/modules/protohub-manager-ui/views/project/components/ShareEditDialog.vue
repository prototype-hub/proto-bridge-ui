<script setup lang="ts">
import { computed, ref, toRef, watch, onScopeDispose } from 'vue'
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
  Modal as AModal,
  Tag as ATag,
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

const props = defineProps<{
  share?: Share
  version?: Version
  busy: boolean
  error: string
  conflict?: boolean
}>()
const emit = defineEmits<{ close: []; save: [input: ShareUpdate]; reload: [] }>()
const { t, locale } = useI18n()
const description = ref('')
const expires = ref<Dayjs>()
const mode = ref<ShareRevisionMode>('fixed')
const revisionId = ref('')
const passwordAction = ref<SharePasswordAction>('keep')
const password = ref('')
const initialDraft = ref('')
let confirmation: ReturnType<typeof AModal.confirm> | undefined
const draft = computed(() =>
  JSON.stringify([
    description.value,
    expires.value?.valueOf(),
    mode.value,
    revisionId.value,
    passwordAction.value,
    password.value,
  ]),
)
const open = computed(() => !!props.share)
const history = useRevisions(toRef(props, 'version'), open)
const revisionOptions = computed(() => {
  const rows = history.rows.value.map((row) => ({
    value: row.id,
    label: `${new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(row.createdAt)} · ${row.versionName}${row.id === props.version?.currentRevisionId ? ` · ${t('proto.currentRevision')}` : ''}`,
  }))
  for (const id of [props.share?.revisionId, props.version?.currentRevisionId])
    if (id && !rows.some((row) => row.value === id))
      rows.unshift({
        value: id,
        label: t(
          id === props.version?.currentRevisionId
            ? 'proto.currentRevision'
            : 'proto.shareSelectedRevision',
        ),
      })
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
    initialDraft.value = draft.value
  },
  { immediate: true, flush: 'sync' },
)
watch(passwordAction, () => {
  password.value = ''
})
function save() {
  const share = props.share
  if (!share || props.busy || props.conflict || share.revoked) return
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
function leave(reload = false) {
  if (props.busy) return
  if (draft.value === initialDraft.value) {
    if (reload) emit('reload')
    else emit('close')
    return
  }
  confirmation = AModal.confirm({
    title: t('proto.shareDiscardTitle'),
    content: t(reload ? 'proto.shareReloadDraftHint' : 'proto.shareDiscardHint'),
    okText: t(reload ? 'proto.shareReloadSettings' : 'proto.shareDiscard'),
    cancelText: t('proto.shareKeepEditing'),
    onOk: () => {
      if (reload) emit('reload')
      else emit('close')
    },
  })
}
onScopeDispose(() => confirmation?.destroy())
</script>
<template>
  <form-modal
    :open="open"
    :title="t('proto.editShare')"
    :model="{ description, expires, mode, revisionId, passwordAction, password }"
    :busy="busy"
    :error="error"
    :width="680"
    wrap-class-name="share-edit-modal"
    form-name="share-edit"
    @cancel="leave()"
    @submit="save"
  >
    <div class="share-edit-object">
      <strong>{{ share?.description || t('proto.shareUntitled') }}</strong
      ><a-tag>{{
        t(share?.revisionMode === 'latest' ? 'proto.shareLatest' : 'proto.shareFixed')
      }}</a-tag>
    </div>
    <a-alert class="share-edit-hint" type="info" show-icon :message="t('proto.shareEditHint')" />
    <h3>{{ t('proto.shareRevisionMode') }}</h3>
    <a-form-item name="description" :label="t('proto.shareDescription')">
      <a-textarea v-model:value="description" :maxlength="2000" :rows="2" show-count />
    </a-form-item>
    <a-form-item name="mode" :label="t('proto.shareRevisionMode')">
      <a-radio-group v-model:value="mode"
        ><a-radio-button value="fixed">{{ t('proto.shareFixed') }}</a-radio-button
        ><a-radio-button value="latest">{{ t('proto.shareLatest') }}</a-radio-button></a-radio-group
      >
      <p class="share-edit-help">
        {{ t(mode === 'fixed' ? 'proto.shareFixedEditHint' : 'proto.shareLatestHint') }}
      </p>
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
    <h3>{{ t('proto.shareAccessTitle') }}</h3>
    <a-form-item name="expires" :label="t('proto.expiresAt')">
      <a-date-picker
        v-model:value="expires"
        show-time
        :disabled-date="(date) => date.endOf('day').valueOf() < Date.now()"
        class="share-edit-expiry"
      />
      <p class="share-edit-help">{{ t('proto.shareExpiryHint') }}</p>
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
    <a-alert
      v-if="passwordAction === 'remove'"
      class="share-edit-hint"
      type="warning"
      show-icon
      :message="t('proto.shareRemovePasswordHint')"
    />
    <a-form-item
      v-if="passwordAction === 'replace'"
      name="password"
      :label="t('proto.password')"
      :rules="[{ required: true, message: t('proto.passwordRequired') }]"
    >
      <a-input-password v-model:value="password" autocomplete="new-password" />
    </a-form-item>
    <template #footer>
      <div class="share-edit-footer">
        <a-button v-if="conflict" @click="leave(true)">{{
          t('proto.shareReloadSettings')
        }}</a-button>
        <a-button :disabled="busy" @click="leave()">{{ t('common.cancel') }}</a-button>
        <a-button type="primary" html-type="submit" :loading="busy" :disabled="busy || conflict">{{
          t('common.save')
        }}</a-button>
      </div>
    </template>
  </form-modal>
</template>
<style scoped>
.share-edit-hint {
  margin-bottom: var(--space-4);
}
.share-edit-object {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  overflow-wrap: anywhere;
}
h3 {
  font-size: var(--text-body);
  margin: var(--space-6) 0 var(--space-3);
}
.share-edit-help {
  color: var(--color-muted);
  margin: var(--space-2) 0 0;
  line-height: 1.6;
}
.share-edit-footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
:global(.share-edit-modal .ant-modal-body) {
  max-height: calc(100dvh - 13rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}
@media (max-width: 767px) {
  :global(.share-edit-modal .ant-modal) {
    top: var(--space-2);
    max-width: calc(100vw - 16px);
    margin: 0 auto;
    padding-bottom: 0;
  }
  :global(.share-edit-modal .ant-modal-body) {
    max-height: calc(100dvh - 6rem);
  }
}
.share-edit-expiry {
  width: 100%;
}
</style>
