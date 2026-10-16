<script setup lang="ts">
defineOptions({ name: 'UsersView' })
import { computed } from 'vue'
import {
  InputPassword as AInputPassword,
  Form as AForm,
  FormItem as AFormItem,
  Modal as AModal,
  Space as ASpace,
  Tag as ATag,
  Alert as AAlert,
  Button as AButton,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import {
  EditOutlined,
  StopOutlined,
  CheckCircleOutlined,
  KeyOutlined,
  DeleteOutlined,
} from '@ant-design/icons-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import { useUsers } from '@/modules/authentication-manager-ui/views/user/hooks/useUsers'
import { useRelatedRecord } from '@/modules/authentication-manager-ui/hooks/useRelatedRecord'
import { authPermissions as p } from '@/modules/authentication-manager-ui/views/user/permissions'
import { enabled } from '@/modules/authentication-manager-ui/utils/identity'
import { displayValue } from '@/modules/authentication-manager-ui/utils/model'
import { userTypeText } from '@/modules/authentication-manager-ui/utils/user'
import UserEditor from '@/modules/authentication-manager-ui/views/user/components/UserEditor.vue'
import PageContainer from '@/shared/components/PageContainer.vue'
import QueryTable from '@/shared/components/QueryTable.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
const { t } = useI18n()
const {
  list,
  task,
  form,
  open,
  roles,
  context,
  positions,
  types,
  typeOptions,
  edit,
  save,
  remove,
  status,
  beginReset,
  closeReset,
  resetId,
  password,
  confirmPassword,
  reset,
  loadOptions,
  editorSession,
} = useUsers()
const { openRelated, relatedError, retryRelated } = useRelatedRecord(
  loadOptions,
  (kind, id) => {
    if (kind === 'role')
      form.value = { ...form.value, roleIdList: [...new Set([...form.value.roleIdList, id])] }
    else if (kind === 'org')
      form.value = { ...form.value, orgIdList: [...new Set([...(form.value.orgIdList || []), id])] }
    else form.value = { ...form.value, positions: [...(form.value.positions || []), { id }] }
  },
  () => (open.value ? editorSession.value : undefined),
)
const columns = computed(() => [
  { title: t('identity.realName'), dataIndex: 'name' },
  { title: t('common.username'), dataIndex: 'username' },
  { title: t('identity.userType'), dataIndex: 'type' },
  { title: t('identity.rolesLabel'), dataIndex: 'roleList' },
  { title: t('identity.positionsLabel'), dataIndex: 'positions' },
  { title: t('common.status'), dataIndex: 'status' },
  { title: t('identity.mobilePhone'), dataIndex: 'telephone' },
  { title: t('system.email'), dataIndex: 'email' },
  { title: t('common.actions'), key: 'actions', width: 184, fixed: 'right' as const },
])
const fields = computed(() => [
  { key: 'name', label: 'identity.realName' },
  { key: 'username', label: 'common.username' },
  { key: 'type', label: 'identity.userType', type: 'select' as const, options: typeOptions.value },
  {
    key: 'roleList',
    label: 'identity.rolesLabel',
    type: 'select' as const,
    options: roles.value.map((row) => ({ value: row.id, label: row.name })),
  },
  {
    key: 'positions',
    label: 'identity.positionsLabel',
    type: 'select' as const,
    options: positions.value.map((row) => ({ value: row.id, label: row.name })),
  },
  {
    key: 'status',
    label: 'common.status',
    type: 'select' as const,
    options: [
      { value: 1, label: t('common.enabled') },
      { value: 0, label: t('common.disabled') },
    ],
  },
  { key: 'telephone', label: 'identity.mobilePhone' },
  { key: 'email', label: 'system.email' },
])
</script>
<template>
  <page-container :title="t('auth.users')">
    <query-table
      :fields="fields"
      target="system-user"
      :rows="list.data.value.data"
      :columns="columns"
      :pagination="list.pagination"
      :loading="list.loading.value"
      :error="list.error.value"
      :action-error="task.error.value"
      @search="list.searchQuery"
      @page="list.page"
      @refresh="list.load"
      @retry="list.load"
    >
      <template #toolbar>
        <permission-button
          :permission="p.users.add"
          type="primary"
          :disabled="task.busy.value"
          @click="edit()"
          >{{ t('common.add') }}</permission-button
        >
      </template>
      <template #cell="{ column, record }">
        <template v-if="column.dataIndex === 'roleList' || column.dataIndex === 'positions'">{{
          displayValue(record[column.dataIndex]) || '--'
        }}</template>
        <template v-else-if="column.dataIndex === 'type'">{{
          userTypeText(record.type, types, record.typeId) || '--'
        }}</template>
        <a-tag
          v-else-if="column.dataIndex === 'status'"
          :color="enabled(record.status) ? 'green' : 'red'"
          >{{ t(enabled(record.status) ? 'common.enabled' : 'common.disabled') }}</a-tag
        >
        <a-space v-else-if="column.key === 'actions'" :size="8">
          <action-button
            :label="t('common.edit')"
            :icon="EditOutlined"
            :permission="p.users.edit"
            :disabled="task.busy.value"
            @action="edit(record)"
          />
          <action-button
            :label="t(enabled(record.status) ? 'common.disabled' : 'common.enabled')"
            :icon="enabled(record.status) ? StopOutlined : CheckCircleOutlined"
            :permission="p.users.status"
            :disabled="task.busy.value"
            :confirm="
              t('identity.confirmStatus', {
                action: t(enabled(record.status) ? 'common.disabled' : 'common.enabled'),
              })
            "
            @action="status(record)"
          />
          <action-button
            :label="t('auth.resetPassword')"
            :icon="KeyOutlined"
            :permission="p.users.edit"
            @action="beginReset(record)"
          />
          <action-button
            :label="t('common.delete')"
            :icon="DeleteOutlined"
            :permission="p.users.delete"
            danger
            :tooltip="enabled(record.status) ? t('identity.enabledDelete') : undefined"
            :disabled="task.busy.value || enabled(record.status)"
            :confirm="t('common.confirmDelete')"
            @action="remove(record.id)"
          /> </a-space
        ><template v-else>{{ displayValue(record[column.dataIndex]) || '--' }}</template>
      </template>
    </query-table>
    <a-modal
      v-model:open="open"
      :destroy-on-close="true"
      :width="675"
      :title="t(form.id ? 'common.edit' : 'common.add')"
      :footer="null"
      :mask-closable="false"
      ><a-button v-if="relatedError" @click="retryRelated">{{ t('common.retry') }}</a-button
      ><user-editor
        v-model:model="form"
        :roles="roles"
        :positions="positions"
        :context="context"
        :busy="task.busy.value"
        :error="task.error.value || relatedError"
        @save="save"
        @related="openRelated"
    /></a-modal>
    <a-modal
      :destroy-on-close="true"
      :open="!!resetId"
      :title="t('auth.resetPassword')"
      :footer="null"
      @cancel="closeReset"
      ><a-form
        name="password-reset"
        layout="vertical"
        :model="{ password, confirmPassword }"
        @finish="reset"
        ><a-form-item
          name="password"
          :label="t('common.password')"
          :rules="[{ required: true, message: t('common.required') }]"
          ><a-input-password v-model:value="password" autocomplete="new-password" /><small>{{
            t('identity.passwordRule')
          }}</small></a-form-item
        ><a-form-item
          name="confirmPassword"
          :label="t('system.confirmPassword')"
          :rules="[{ required: true, message: t('common.required') }]"
          ><a-input-password
            v-model:value="confirmPassword"
            autocomplete="new-password" /></a-form-item
        ><a-alert v-if="task.error.value" type="error" :message="task.error.value" /><a-button
          type="primary"
          html-type="submit"
          :loading="task.busy.value"
          >{{ t('common.save') }}</a-button
        ></a-form
      ></a-modal
    >
  </page-container>
</template>
