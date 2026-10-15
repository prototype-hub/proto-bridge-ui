<script setup lang="ts">
import { computed, toRef } from 'vue'
import {
  Modal as AModal,
  Space as ASpace,
  Popconfirm as APopconfirm,
  Tag as ATag,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { DisconnectOutlined } from '@ant-design/icons-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import dayjs from 'dayjs'
import { useRoleMembers } from '@/modules/authentication-manager-ui/views/role/hooks/useRoleMembers'
import { authPermissions as p } from '@/modules/authentication-manager-ui/views/role/permissions'
import { enabled } from '@/modules/authentication-manager-ui/utils/identity'
import QueryTable from '@/shared/components/QueryTable.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
const props = defineProps({ roleId: { type: String, required: true } })
const { t } = useI18n()
const {
  members,
  candidates,
  task,
  open,
  selected,
  selectedCandidates,
  pagination,
  candidatePagination,
  search,
  page,
  candidateSearch,
  candidatePage,
  add,
  bind,
  unbind,
} = useRoleMembers(toRef(props, 'roleId'))
const columns = computed(() => [
  { title: t('identity.realName'), dataIndex: 'name' },
  { title: t('common.username'), dataIndex: 'username' },
  { title: t('system.createTime'), dataIndex: 'createTime' },
  { title: t('common.status'), dataIndex: 'status' },
  { title: t('common.actions'), key: 'actions', width: 64 },
])
const fields = computed(() => [
  { key: 'name', label: 'identity.realName' },
  { key: 'username', label: 'common.username' },
  { key: 'createTime', label: 'system.createTime', type: 'date' as const },
  {
    key: 'status',
    label: 'common.status',
    type: 'select' as const,
    options: [
      { value: 1, label: t('common.enabled') },
      { value: 0, label: t('common.disabled') },
    ],
  },
])
function createdAt(value: unknown) {
  return (typeof value === 'number' || typeof value === 'string') && value
    ? dayjs(value).format('YYYY-MM-DD HH:mm:ss')
    : '--'
}
</script>
<template>
  <div class="stack">
    <query-table
      :panel="false"
      :fields="fields"
      target="system-role-user"
      :rows="members.data.value"
      :columns="columns"
      :pagination="pagination"
      :loading="members.loading.value"
      :error="members.error.value"
      :action-error="task.error.value"
      :table-props="{
        rowSelection: {
          selectedRowKeys: selected,
          preserveSelectedRowKeys: true,
          onChange: (keys) => (selected = keys.map(String)),
        },
        scroll: { x: 750 },
      }"
      @search="search"
      @page="page"
      @refresh="members.load"
      @retry="members.load"
    >
      <template #toolbar>
        <a-space
          ><permission-button :permission="p.roles.edit" type="primary" @click="add">{{
            t('common.add')
          }}</permission-button
          ><a-popconfirm :title="t('common.confirmDelete')" @confirm="unbind()"
            ><permission-button
              :permission="p.roles.edit"
              :disabled="!selected.length || task.busy.value"
              >{{ t('system.batchUnbind') }}</permission-button
            ></a-popconfirm
          ></a-space
        >
      </template>
      <template #cell="{ column, record }"
        ><a-tag
          v-if="column.dataIndex === 'status'"
          :color="enabled(record.status) ? 'green' : 'red'"
          >{{ t(enabled(record.status) ? 'common.enabled' : 'common.disabled') }}</a-tag
        ><template v-else-if="column.dataIndex === 'createTime'">{{
          createdAt(record.createTime)
        }}</template
        ><action-button
          v-else-if="column.key === 'actions'"
          :label="t('system.unbind')"
          :icon="DisconnectOutlined"
          :permission="p.roles.edit"
          :confirm="t('common.confirmDelete')"
          @action="unbind([record.id])"
        /><template v-else>{{ record[String(column.dataIndex)] || '--' }}</template></template
      >
    </query-table>
    <a-modal
      v-model:open="open"
      :title="t('identity.selectUsers')"
      :width="1000"
      :confirm-loading="task.busy.value"
      :ok-button-props="{ disabled: !selectedCandidates.length }"
      @ok="bind"
      ><query-table
        :panel="false"
        :fields="fields.slice(0, 2)"
        :rows="candidates.data.value"
        :columns="columns.slice(0, -1)"
        :pagination="candidatePagination"
        :loading="candidates.loading.value"
        :error="candidates.error.value"
        :action-error="task.error.value"
        :table-props="{
          rowSelection: {
            selectedRowKeys: selectedCandidates,
            preserveSelectedRowKeys: true,
            onChange: (keys) => (selectedCandidates = keys.map(String)),
          },
          scroll: { x: 700 },
        }"
        @search="candidateSearch"
        @page="candidatePage"
        @refresh="candidates.load"
        @retry="candidates.load"
      >
        <template #cell="{ column, record }">
          <a-tag
            v-if="column.dataIndex === 'status'"
            :color="enabled(record.status) ? 'green' : 'red'"
            >{{ t(enabled(record.status) ? 'common.enabled' : 'common.disabled') }}</a-tag
          >
          <template v-else-if="column.dataIndex === 'createTime'">{{
            createdAt(record.createTime)
          }}</template>
          <template v-else>{{ record[column.dataIndex] || '--' }}</template>
        </template>
      </query-table></a-modal
    >
  </div>
</template>
