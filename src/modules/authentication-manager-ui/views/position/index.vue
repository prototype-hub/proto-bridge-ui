<script setup lang="ts">
defineOptions({ name: 'PositionsView' })
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Drawer as ADrawer, Space as ASpace } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { EditOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import type { QueryField } from '@/shared/api/types'
import type { Model, SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import type { FormContext } from '@/modules/authentication-manager-ui/types/forms'
import { queryPage, detail, del } from '@/modules/authentication-manager-ui/api/position/positions'
import {
  positionDetail,
  positionQuery,
} from '@/modules/authentication-manager-ui/views/position/definition'
import { organizationSearchOptions } from '@/modules/authentication-manager-ui/utils/organization'
import { formOptions } from '@/modules/authentication-manager-ui/hooks/form-options'
import { displayValue } from '@/modules/authentication-manager-ui/utils/model'
import { useLegacyDetail } from '@/modules/authentication-manager-ui/hooks/useLegacyDetail'
import { useOrganizationRecords } from '@/modules/authentication-manager-ui/hooks/useOrganizationRecords'
import { useTask } from '@/shared/composables/useTask'
import { deleted } from '@/shared/utils/feedback'
import PageContainer from '@/shared/components/PageContainer.vue'
import QueryTable from '@/shared/components/QueryTable.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import PositionDetailsPanel from '@/modules/authentication-manager-ui/views/position/components/PositionDetail.vue'
const { t } = useI18n()
const route = useRoute()
const task = useTask(),
  selected = ref<SystemRecord | Model>(),
  options = ref<FormContext>({})
const state = useOrganizationRecords((query) => queryPage(positionQuery(query)))
const fields = computed<QueryField[]>(() => [
  { key: 'id', label: 'system.id' },
  { key: 'name', label: 'common.name' },
  { key: 'roles', label: 'system.roles', type: 'select', options: options.value.roles },
  { key: 'parentId', label: 'system.parentName', type: 'select', options: options.value.positions },
  {
    key: 'orgId',
    label: 'system.orgName',
    type: 'select',
    options: organizationSearchOptions(options.value.organizations || []),
  },
  { key: 'description', label: 'system.description' },
])
const columns = computed(() => [
  ...['id', 'name', 'roles', 'parentName', 'orgName', 'description'].map((key) => ({
    title: t(`system.${key}`),
    dataIndex: key,
    ellipsis: true,
  })),
  { title: t('common.actions'), key: 'actions', dataIndex: 'actions', width: 104 },
])
async function edit(row?: SystemRecord) {
  if (!row) {
    selected.value = {}
    return
  }
  await task.run(async () => {
    selected.value = positionDetail(await detail(row.id)) || row
  })
}
async function remove(id: string) {
  await task.run(async () => {
    await del(id)
    deleted()
    await state.load()
  })
}
async function savedPosition(record: Model) {
  selected.value = record
  await state.load()
}
useLegacyDetail(
  async (id, _path, current) => {
    if (id === ':id') selected.value = {}
    else {
      const loaded = positionDetail(await detail(id))
      if (current()) selected.value = loaded
    }
  },
  async () => {
    selected.value = {}
  },
)
onMounted(async () => {
  if (route.query.save) selected.value = {}
  await state.load()
  await task.run(async () => {
    options.value = await formOptions(['roles', 'organizations', 'positions'])
  })
})
</script>
<template>
  <page-container :title="t('system.positions')"
    ><query-table
      target="system-position"
      :fields="fields"
      :rows="state.data.value"
      :columns="columns"
      :pagination="state.pagination"
      :loading="state.loading.value"
      :error="state.error.value"
      :action-error="task.error.value"
      @search="state.search"
      @page="state.page"
      @refresh="state.load"
      @retry="state.load"
    >
      <template #toolbar>
        <permission-button permission="system/Positions:add" type="primary" @click="edit()">{{
          t('common.add')
        }}</permission-button>
      </template>
      <template #cell="{ record, column }"
        ><a-space v-if="column.key === 'actions'" :size="8">
          <action-button
            :label="t('common.edit')"
            :icon="EditOutlined"
            permission="system/Positions:update"
            @action="edit(record)"
          />
          <action-button
            :label="t('common.delete')"
            :icon="DeleteOutlined"
            permission="system/Positions:delete"
            danger
            :confirm="t('common.confirmDelete')"
            @action="remove(record.id)"
          /> </a-space
        ><span v-else>{{ displayValue(record[column.dataIndex]) || '--' }}</span></template
      >
    </query-table>
    <a-drawer
      :open="!!selected"
      :title="selected?.name ? String(selected.name) : t('common.add')"
      :width="'min(1000px, 100vw)'"
      @close="selected = undefined"
      ><position-details-panel v-if="selected" :record="selected" @saved="savedPosition"
    /></a-drawer>
  </page-container>
</template>
