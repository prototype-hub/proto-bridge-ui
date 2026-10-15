<script setup lang="ts">
defineOptions({ name: 'PermissionsView' })
import { computed, ref } from 'vue'
import { Space as ASpace, Tag as ATag } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import {
  EditOutlined,
  StopOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
} from '@ant-design/icons-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import { usePermissionResources } from '@/modules/authentication-manager-ui/views/permission/hooks/usePermissionResources'
import { enabled } from '@/modules/authentication-manager-ui/utils/identity'
import { identityPermissions } from '@/modules/authentication-manager-ui/views/permission/permissions'
import PermissionEditor from '@/modules/authentication-manager-ui/views/permission/components/PermissionEditor.vue'
import PageContainer from '@/shared/components/PageContainer.vue'
import QueryTable from '@/shared/components/QueryTable.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
const { t } = useI18n()
const { list, task, draft, editing, search, edit, save, status, remove, importFile, exportFile } =
  usePermissionResources()
const upload = ref<HTMLInputElement>()
const columns = computed(() => [
  { title: t('common.id'), dataIndex: 'id' },
  { title: t('common.name'), dataIndex: 'name' },
  { title: t('common.status'), dataIndex: 'status' },
  { title: t('common.actions'), key: 'actions', width: 144 },
])
function importChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) void importFile(file)
  if (upload.value) upload.value.value = ''
}
</script>
<template>
  <page-container :title="t('auth.permissions')"
    ><query-table
      :fields="[
        { key: 'id', label: 'common.id' },
        { key: 'name', label: 'common.name' },
        {
          key: 'status',
          label: 'common.status',
          type: 'select',
          options: [
            { value: 1, label: t('common.enabled') },
            { value: 0, label: t('common.disabled') },
          ],
        },
      ]"
      target="system-permission"
      :rows="list.data.value.data"
      :columns="columns"
      :pagination="list.pagination"
      :loading="list.loading.value"
      :error="list.error.value"
      :action-error="task.error.value"
      @search="search"
      @page="list.page"
      @refresh="list.load"
      @retry="list.load"
    >
      <template #toolbar>
        <a-space wrap
          ><permission-button
            :permission="identityPermissions.resource.add"
            type="primary"
            @click="edit()"
            >{{ t('common.add') }}</permission-button
          ><permission-button
            :permission="identityPermissions.resource.import"
            @click="upload?.click()"
            >{{ t('system.import') }}</permission-button
          ><permission-button
            :permission="identityPermissions.resource.export"
            :loading="task.busy.value"
            @click="exportFile"
            >{{ t('system.export') }}</permission-button
          ></a-space
        ><input
          ref="upload"
          type="file"
          accept=".json,application/json"
          hidden
          @change="importChange"
        />
      </template>
      <template #cell="{ column, record }"
        ><a-tag
          v-if="column.dataIndex === 'status'"
          :color="enabled(record.status) ? 'green' : 'red'"
          >{{ t(enabled(record.status) ? 'common.enabled' : 'common.disabled') }}</a-tag
        ><a-space v-else-if="column.key === 'actions'" :size="8">
          <action-button
            :label="t('common.edit')"
            :icon="EditOutlined"
            :permission="identityPermissions.resource.update"
            @action="edit(record)"
          />
          <action-button
            :label="t(enabled(record.status) ? 'common.disabled' : 'common.enabled')"
            :icon="enabled(record.status) ? StopOutlined : CheckCircleOutlined"
            :permission="identityPermissions.resource.action"
            :disabled="task.busy.value"
            :confirm="
              t('identity.confirmStatus', {
                action: t(enabled(record.status) ? 'common.disabled' : 'common.enabled'),
              })
            "
            @action="status(record)"
          />
          <action-button
            :label="t('common.delete')"
            :icon="DeleteOutlined"
            :permission="identityPermissions.resource.delete"
            danger
            :disabled="task.busy.value || enabled(record.status)"
            :tooltip="enabled(record.status) ? t('identity.enabledDelete') : undefined"
            :confirm="t('common.confirmDelete')"
            @action="remove(record)"
          /> </a-space
        ><template v-else>{{ record[column.dataIndex] }}</template></template
      >
    </query-table>
    <permission-editor
      v-model="draft"
      :editing="editing"
      :busy="task.busy.value"
      :error="task.error.value"
      @save="save"
  /></page-container>
</template>
