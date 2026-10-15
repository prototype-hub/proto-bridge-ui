<script setup lang="ts">
defineOptions({ name: 'MenusView' })
import { computed, ref, watch } from 'vue'
import { EditOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { useMenus } from '@/modules/authentication-manager-ui/views/menu/hooks/useMenus'
import { flattenMenus } from '@/modules/authentication-manager-ui/views/role/utils/grants'
import { menuDepth } from '@/modules/authentication-manager-ui/utils/menu'
import { authPermissions as p } from '@/modules/authentication-manager-ui/views/menu/permissions'
import type { QueryField } from '@/shared/api/types'
import MenuTools from '@/modules/authentication-manager-ui/views/menu/components/MenuTools.vue'
import MenuEditor from '@/modules/authentication-manager-ui/views/menu/components/MenuEditor.vue'
import PageContainer from '@/shared/components/PageContainer.vue'
import QueryTable from '@/shared/components/QueryTable.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import { menuDisplayName } from '@/shared/auth/menu-display'
const { t, locale } = useI18n(),
  state = useMenus(),
  expanded = ref<string[]>([])
watch(
  () => state.resource.data.value,
  (menus) => {
    const valid = new Set(
      flattenMenus(menus)
        .filter((row) => row.menu.children?.length)
        .map((row) => row.menu.id),
    )
    expanded.value = expanded.value.filter((key) => valid.has(key))
  },
  { immediate: true },
)
const fields: QueryField[] = [
  { key: 'code', label: 'configuration.menuCode' },
  { key: 'name', label: 'configuration.menuName' },
  { key: 'url', label: 'configuration.url' },
  { key: 'sortIndex', label: 'configuration.sort', type: 'number' },
  { key: 'createTime', label: 'common.createdAt', type: 'date' },
]
const columns = computed(() => [
  { title: t('configuration.menuCode'), dataIndex: 'code', width: 240 },
  { title: t('configuration.menuName'), dataIndex: 'name', width: 180, ellipsis: true },
  { title: t('configuration.url'), dataIndex: 'url', width: 220, ellipsis: true },
  { title: t('configuration.sort'), dataIndex: 'sortIndex', width: 80 },
  { title: t('configuration.description'), dataIndex: 'describe', width: 180, ellipsis: true },
  { title: t('common.createdAt'), dataIndex: 'createTime', width: 180 },
  { title: t('common.actions'), key: 'actions', width: 144 },
])
</script>
<template>
  <page-container :title="t('auth.menus')"
    ><query-table
      :fields="fields"
      target="category"
      :rows="state.resource.data.value"
      :columns="columns"
      :loading="state.resource.loading.value"
      :error="state.resource.error.value"
      :action-error="state.task.error.value"
      :table-props="{
        scroll: { x: 1330 },
        tableLayout: 'fixed',
        expandedRowKeys: expanded,
        onExpandedRowsChange: (keys) => (expanded = keys.map(String)),
      }"
      @search="state.search"
      @refresh="state.resource.load"
      @retry="state.resource.load"
    >
      <template #toolbar>
        <permission-button :permission="p.menus.add" type="primary" @click="state.edit()">{{
          t('common.add')
        }}</permission-button
        ><menu-tools :menus="state.resource.data.value" @refresh="state.resource.load" />
      </template>
      <template #cell="{ column, record }">
        <div v-if="column.key === 'actions'" class="menu-actions">
          <action-button
            :label="t('common.edit')"
            :icon="EditOutlined"
            :permission="p.menus.edit"
            @action="state.detail(record)"
          /><action-button
            :label="t('configuration.addChild')"
            :icon="PlusOutlined"
            :permission="p.menus.add"
            :disabled="menuDepth(state.resource.data.value, record.id) >= 3"
            @action="state.edit(undefined, record)"
          /><action-button
            :label="t('common.delete')"
            :icon="DeleteOutlined"
            :permission="p.menus.delete"
            danger
            :confirm="t('common.confirmDelete')"
            :disabled="state.task.busy.value"
            @action="state.remove(record.id)"
          />
        </div>
        <template v-else-if="column.dataIndex === 'name'">{{
          menuDisplayName(record, locale)
        }}</template>
        <template v-else-if="column.dataIndex === 'createTime'">{{
          record.createTime ? new Date(record.createTime).toLocaleString() : '—'
        }}</template
        ><template v-else>{{ record[column.dataIndex] }}</template>
      </template>
    </query-table>
    <menu-editor
      v-if="state.open.value"
      v-model="state.form.value"
      v-model:open="state.open.value"
      :menus="state.resource.data.value"
      :parents="state.parents.value"
      :creating="state.creating.value"
      :busy="state.task.busy.value"
      :error="state.task.error.value"
      @save="state.save"
      @buttons="state.updateButtons"
    />
  </page-container>
</template>
<style scoped>
.menu-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
</style>
