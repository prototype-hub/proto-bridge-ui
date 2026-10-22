<script setup lang="ts">
import { computed, toRef, defineAsyncComponent, type PropType } from 'vue'
import dayjs from 'dayjs'
import {
  Modal as AModal,
  Textarea as ATextarea,
  InputPassword as AInputPassword,
  DatePicker as ADatePicker,
  Form as AForm,
  FormItem as AFormItem,
  Alert as AAlert,
  Space as ASpace,
  Tag as ATag,
  RadioGroup as ARadioGroup,
  RadioButton as ARadioButton,
} from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { useShares } from '@/modules/protohub-manager-ui/views/project/hooks/useShares'
import type { Project, Share, Version } from '@/modules/protohub-manager-ui/types'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import LoadState from '@/shared/components/LoadState.vue'
import DataTable from '@/shared/components/DataTable.vue'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import ShareCopyDialog from './ShareCopyDialog.vue'
import { usePermissions } from '@/shared/auth/provider'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
const ShareEditDialog = defineAsyncComponent(() => import('./ShareEditDialog.vue'))
const props = defineProps({
  version: { type: Object as PropType<Version>, default: undefined },
  project: { type: Object as PropType<Project>, default: undefined },
})
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const permissions = usePermissions()
const validityColors = {
  permanent: 'success',
  temporary: 'warning',
  expired: 'default',
  disabled: 'default',
  revoked: 'error',
} as const
const columns = computed<TableColumnsType<Share>>(() => [
  {
    title: t('proto.link'),
    dataIndex: 'sharePath',
    width: 200,
    ellipsis: { showTitle: false },
  },
  {
    title: t('proto.shareDescription'),
    dataIndex: 'description',
    width: 130,
    ellipsis: { showTitle: false },
  },
  { title: t('common.status'), dataIndex: 'enabled', width: 80 },
  { title: t('proto.password'), dataIndex: 'passwordRequired', width: 90 },
  { title: t('proto.shareTime'), dataIndex: 'createdAt', width: 140 },
  { title: t('proto.expiryTime'), dataIndex: 'expiresAt', width: 140 },
  { title: t('common.actions'), key: 'actions', width: 248 },
])
const {
  task,
  resource,
  revisionMode,
  editTarget,
  edit,
  closeEdit,
  update,
  setEnabled,
  revoke,
  rotate,
  description,
  password,
  expires,
  create,
  remove,
  url,
  copy,
  validity,
  shareCopy,
} = useShares(toRef(props, 'version'), toRef(props, 'project'))
// Keyboard form submission must respect the same capability as the visible creation button.
const submitCreate = () => {
  if (
    !props.version?.migrationRequired &&
    projectAllows(props.project, 'manageShares') &&
    permissions.can(p.share.save)
  )
    void create()
}
</script>
<template>
  <a-modal
    :destroy-on-close="true"
    :open="!!version && projectAllows(project, 'manageShares')"
    :title="t('proto.share')"
    :footer="null"
    :width="1120"
    wrap-class-name="share-management-modal"
    @cancel="emit('close')"
    ><a-alert type="info" show-icon :message="t('proto.shareRevisionHint')" /><a-form
      name="share-create"
      class="share-create"
      :model="{ description, password, expires, revisionMode }"
      layout="vertical"
      @submit.prevent="submitCreate"
      ><a-form-item class="share-password" name="password" :label="t('proto.password')"
        ><a-input-password
          v-model:value="password"
          :placeholder="t('proto.passwordOptional')"
          autocomplete="new-password" /></a-form-item
      ><a-form-item class="share-expiry" name="expires" :label="t('proto.expiresAt')"
        ><a-date-picker
          v-model:value="expires"
          show-time
          :disabled-date="(date) => date.endOf('day').valueOf() < Date.now()" /></a-form-item
      ><a-form-item
        class="share-description"
        name="description"
        :label="t('proto.shareDescription')"
        ><a-textarea
          v-model:value="description"
          :placeholder="t('proto.shareDescriptionPlaceholder')"
          :maxlength="2000"
          :rows="2"
          show-count /></a-form-item
      ><a-form-item class="share-mode" name="revisionMode" :label="t('proto.shareRevisionMode')">
        <a-radio-group v-model:value="revisionMode"
          ><a-radio-button value="fixed">{{ t('proto.shareFixed') }}</a-radio-button
          ><a-radio-button value="latest">{{
            t('proto.shareLatest')
          }}</a-radio-button></a-radio-group
        > </a-form-item
      ><permission-button
        class="share-create-button"
        :permission="p.share.save"
        type="primary"
        :loading="task.busy.value"
        html-type="submit"
        >{{ t('proto.createShare') }}</permission-button
      ></a-form
    ><a-alert v-if="task.error.value" type="error" :message="task.error.value" /><load-state
      :loading="resource.loading.value"
      :error="resource.error.value"
      :empty="!resource.data.value.length"
      @retry="resource.load"
      ><div class="share-list">
        <data-table class="share-table" :rows="resource.data.value" :columns="columns"
          ><template #cell="{ column, record }"
            ><template v-if="column.dataIndex === 'sharePath'"
              ><text-ellipsis class="share-url" :text="url(record)" /><span
                class="share-revision-mode"
                :title="record.revisionId || ''"
                >{{
                  t(record.revisionMode === 'latest' ? 'proto.shareLatest' : 'proto.shareFixed')
                }}</span
              ></template
            ><text-ellipsis
              v-else-if="column.dataIndex === 'description'"
              class="share-description-text"
              :text="record.description || ''" /><a-tag
              v-else-if="column.dataIndex === 'enabled'"
              class="share-status"
              :color="validityColors[validity(record)]"
              >{{ t(`proto.shareStatus.${validity(record)}`) }}</a-tag
            ><span
              v-else-if="column.dataIndex === 'passwordRequired'"
              class="share-password-state"
              >{{ t(record.passwordRequired ? 'proto.password' : 'proto.noPassword') }}</span
            ><span v-else-if="column.dataIndex === 'createdAt'" class="share-created-time">{{
              dayjs(record.createdAt).format('YYYY-MM-DD HH:mm:ss')
            }}</span
            ><span v-else-if="column.dataIndex === 'expiresAt'" class="share-expiry-time">{{
              record.expiresAt == null ? '—' : dayjs(record.expiresAt).format('YYYY-MM-DD HH:mm:ss')
            }}</span
            ><a-space v-else-if="column.key === 'actions'" :size="4" :wrap="false">
              <action-button
                v-if="['permanent', 'temporary'].includes(validity(record))"
                :label="t('common.copy')"
                :icon="CopyOutlined"
                @action="copy(record)"
              />
              <action-button
                v-if="!record.revoked"
                :label="t('common.edit')"
                :icon="EditOutlined"
                :permission="p.share.save"
                :disabled="task.busy.value"
                @action="edit(record)"
              />
              <action-button
                v-if="!record.revoked"
                :label="t(record.enabled ? 'proto.pauseShare' : 'proto.resumeShare')"
                :icon="record.enabled ? PauseCircleOutlined : PlayCircleOutlined"
                :permission="p.share.save"
                :disabled="task.busy.value"
                :confirm="
                  t(record.enabled ? 'proto.pauseShareConfirm' : 'proto.resumeShareConfirm')
                "
                @action="setEnabled(record)"
              />
              <action-button
                v-if="!record.revoked"
                :label="t('proto.rotateShare')"
                :icon="ReloadOutlined"
                :permission="p.share.save"
                :disabled="task.busy.value"
                :confirm="t('proto.rotateShareConfirm')"
                @action="rotate(record)"
              />
              <action-button
                v-if="!record.revoked"
                :label="t('proto.revokeShare')"
                :icon="StopOutlined"
                :permission="p.share.save"
                :disabled="task.busy.value"
                danger
                :confirm="t('proto.revokeShareConfirm')"
                @action="revoke(record)"
              />
              <action-button
                :label="t('common.delete')"
                :icon="DeleteOutlined"
                :permission="p.share.delete"
                danger
                :disabled="task.busy.value"
                :confirm="t('common.confirmDelete')"
                @action="remove(record.id)"
              /> </a-space></template
        ></data-table></div></load-state
  ></a-modal>
  <share-edit-dialog
    v-if="editTarget && permissions.can(p.share.save) && projectAllows(project, 'manageShares')"
    :share="editTarget"
    :version="version"
    :busy="task.busy.value"
    :error="task.error.value"
    @close="closeEdit"
    @save="update"
  />
  <share-copy-dialog
    v-model:password="shareCopy.enteredPassword.value"
    :open="!!shareCopy.target.value"
    :verified="shareCopy.verified.value"
    :busy="shareCopy.busy.value"
    :error="shareCopy.error.value"
    :content="shareCopy.content.value"
    @close="shareCopy.cancel"
    @verify="shareCopy.verify"
    @copy="shareCopy.copyVerified"
  />
</template>
<style scoped>
.share-revision-mode {
  display: block;
  color: var(--color-muted);
  font-size: var(--text-small);
}
.share-list {
  width: 100%;
  min-width: 0;
  margin-top: var(--space-4);
  max-width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
.share-table {
  max-width: 100%;
  min-width: 0;
}
.share-table :deep(.ant-spin-nested-loading),
.share-table :deep(.ant-spin-container) {
  min-width: 0;
}
.share-table :deep(.ant-table-cell) {
  white-space: nowrap;
}
.share-table :deep(.ant-table-container) {
  border-radius: var(--radius);
}
.share-table :deep(.ant-table-content) {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
}
.share-create {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) minmax(230px, 1fr) auto;
  align-items: flex-end;
  gap: var(--space-3);
}
.share-create :deep(.ant-form-item) {
  margin-bottom: 0;
  min-width: 0;
}
.share-description {
  grid-column: 1 / 3;
  grid-row: 2;
}
.share-password {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
}
.share-expiry {
  grid-column: 2 / -1;
  grid-row: 1;
  min-width: 0;
}
.share-expiry :deep(.ant-picker) {
  width: 100%;
}
.share-mode {
  grid-column: 1 / 3;
  grid-row: 3;
}
.share-create-button {
  flex: 0 0 auto;
  grid-column: 3;
  grid-row: 2;
  margin-bottom: 22px;
}
@media (max-width: 767px) {
  :global(.share-management-modal .ant-modal) {
    max-width: calc(100vw - 16px);
    margin: var(--space-2) auto;
  }
  .share-create {
    grid-template-columns: minmax(0, 1fr);
  }
  .share-description,
  .share-password,
  .share-expiry,
  .share-mode,
  .share-create-button {
    grid-column: auto;
    grid-row: auto;
  }
  .share-create-button {
    width: 100%;
    margin-bottom: 0;
  }
}
</style>
