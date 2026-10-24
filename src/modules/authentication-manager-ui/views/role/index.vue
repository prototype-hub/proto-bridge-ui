<script setup lang="ts">
defineOptions({ name: 'RolesView' })
import { computed } from 'vue'
import {
  Input as AInput,
  Textarea as ATextarea,
  FormItem as AFormItem,
  Space as ASpace,
  Select as ASelect,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { EditOutlined, SafetyCertificateOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import { useLegacyDetail } from '@/modules/authentication-manager-ui/hooks/useLegacyDetail'
import { getRoleDetails_api } from '@/modules/authentication-manager-ui/api/role/role'
import { recordsOf } from '@/modules/authentication-manager-ui/utils/model'
import { useRoles } from '@/modules/authentication-manager-ui/views/role/hooks/useRoles'
import { authPermissions as p } from '@/modules/authentication-manager-ui/views/role/permissions'
import { useSession } from '@/app/stores/session'
import RoleGroups from '@/modules/authentication-manager-ui/views/role/components/RoleGroups.vue'
import QueryTable from '@/shared/components/QueryTable.vue'
import FormModal from '@/shared/components/FormModal.vue'
import RoleDetail from '@/modules/authentication-manager-ui/views/role/components/RoleDetail.vue'
import PageContainer from '@/shared/components/PageContainer.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
const { t } = useI18n(),
  session = useSession()
const {
  group,
  groups,
  groupSearch,
  groupOpen,
  groupForm,
  loadGroups,
  selectGroup,
  searchRoles,
  editGroup,
  saveGroup,
  removeGroup,
  list,
  task,
  form,
  open,
  creating,
  selected,
  edit,
  save,
  remove,
} = useRoles()
useLegacyDetail(async (id, _path, current) => {
  const loaded = recordsOf([((await getRoleDetails_api(id)) as { result: unknown }).result])[0]
  if (current()) selected.value = loaded
})
const columns = computed(() => [
  { title: t('common.name'), dataIndex: 'name' },
  { title: t('common.description'), dataIndex: 'description' },
  { title: t('common.actions'), key: 'actions', width: 144 },
])
</script>
<template>
  <page-container :title="t('auth.roles')">
    <div class="role-workspace">
      <aside class="panel role-sidebar">
        <role-groups
          v-model:search="groupSearch"
          :groups="groups"
          :selected="group"
          :admin="session.user?.username === 'admin'"
          @select="selectGroup"
          @search="loadGroups"
          @edit="editGroup"
          @remove="removeGroup"
        />
      </aside>
      <query-table
        class="role-content"
        :fields="[
          { key: 'name', label: 'common.name' },
          { key: 'description', label: 'common.description' },
        ]"
        target="system-role"
        :rows="list.data.value.data"
        :columns="columns"
        :pagination="list.pagination"
        :loading="list.loading.value"
        :error="list.error.value"
        :action-error="task.error.value"
        @search="searchRoles"
        @page="list.page"
        @refresh="list.load"
        @retry="list.load"
      >
        <template #toolbar>
          <permission-button :permission="p.roles.add" type="primary" @click="edit()">{{
            t('common.add')
          }}</permission-button>
        </template>
        <template #cell="{ column, record }"
          ><a-space v-if="column.key === 'actions'" :size="8">
            <action-button
              :label="t('common.edit')"
              :icon="EditOutlined"
              :permission="p.roles.edit"
              @action="edit(record)"
            />
            <action-button
              :label="t('identity.permissionSettings')"
              :icon="SafetyCertificateOutlined"
              :permission="p.roles.edit"
              @action="selected = record"
            />
            <action-button
              :label="t('common.delete')"
              :icon="DeleteOutlined"
              :permission="p.roles.delete"
              danger
              :disabled="task.busy.value"
              :confirm="t('common.confirmDelete')"
              @action="remove(record.id)"
            /> </a-space
          ><template v-else>{{ record[column.dataIndex] || '--' }}</template></template
        >
      </query-table>
    </div>
    <form-modal
      v-model:open="open"
      :width="670"
      :title="t(creating ? 'common.add' : 'common.edit')"
      form-name="role-editor"
      :model="form"
      :busy="task.busy.value"
      :error="task.error.value"
      @submit="save"
      ><a-form-item
        name="name"
        :label="t('common.name')"
        :rules="[{ required: true, whitespace: true, max: 64, message: t('common.required') }]"
        ><a-input v-model:value="form.name" :maxlength="64" /></a-form-item
      ><a-form-item
        name="groupId"
        :label="t('system.roleGroups')"
        :rules="[{ required: true, message: t('common.required') }]"
        ><a-select
          :value="String(form.groupId || '')"
          show-search
          option-filter-prop="label"
          :options="groups.map((row) => ({ value: row.id, label: row.name }))"
          @update:value="form.groupId = $event" /></a-form-item
      ><a-form-item :label="t('common.description')"
        ><a-textarea v-model:value="form.description" :maxlength="200" show-count /></a-form-item
    ></form-modal>
    <form-modal
      v-model:open="groupOpen"
      :title="t('system.roleGroups')"
      :width="520"
      form-name="role-group-editor"
      :model="groupForm"
      :busy="task.busy.value"
      :error="task.error.value"
      @submit="saveGroup"
      ><a-form-item
        name="name"
        :label="t('common.name')"
        :rules="[{ required: true, whitespace: true, max: 64, message: t('common.required') }]"
        ><a-input v-model:value="groupForm.name" :maxlength="64" /></a-form-item
    ></form-modal>
    <role-detail :role="selected" @close="selected = undefined" />
  </page-container>
</template>
<style scoped>
.role-workspace {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  gap: 16px;
}
.role-content {
  min-width: 0;
}
@media (width <= 900px) {
  .role-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
