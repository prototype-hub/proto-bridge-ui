<script setup lang="ts">
defineOptions({ name: 'DepartmentsView' })
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Tree as ATree,
  Tabs as ATabs,
  TabPane as ATabPane,
  Space as ASpace,
  Popconfirm as APopconfirm,
  InputSearch as AInputSearch,
  Empty as AEmpty,
  Alert as AAlert,
} from 'ant-design-vue'
import { EditOutlined, PlusCircleOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import * as api from '@/modules/authentication-manager-ui/api/department/department'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import {
  recordsOf,
  flatten,
  stringValue,
  resultOf,
  isRecord,
} from '@/modules/authentication-manager-ui/utils/model'
import { nextOrganizationOrder } from '@/modules/authentication-manager-ui/utils/organization'
import { validateOrganization } from '@/modules/authentication-manager-ui/views/department/definition'
import { treeNodes } from '@/modules/authentication-manager-ui/utils/tree'
import { finishRelatedSave } from '@/modules/authentication-manager-ui/utils/related-record'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { saved, deleted } from '@/shared/utils/feedback'
import PageContainer from '@/shared/components/PageContainer.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import LoadState from '@/shared/components/LoadState.vue'
import OrganizationEditor from '@/modules/authentication-manager-ui/views/department/components/OrganizationEditor.vue'
import DepartmentPositions from '@/modules/authentication-manager-ui/views/department/components/DepartmentPositions.vue'
import UserBinding from '@/modules/authentication-manager-ui/components/membership/UserBinding.vue'
const { t } = useI18n(),
  route = useRoute()
const search = ref(''),
  selected = ref(stringValue(route.query.id)),
  active = ref('positions'),
  draft = ref<Model>()
const positionId = ref('')
const task = useTask()
const tree = useResource(
  async () =>
    recordsOf(
      await api.getTreeData_api({
        paging: false,
        sorts: [
          { name: 'sortIndex', order: 'asc' },
          { name: 'name', order: 'asc' },
        ],
        terms: search.value ? [{ column: 'name$LIKE', value: `%${search.value}%` }] : [],
      }),
    ),
  [],
)
const current = computed(() => flatten(tree.data.value).find((row) => row.id === selected.value))
async function load() {
  await tree.load()
  if (!current.value) selected.value = tree.data.value[0]?.id || ''
}
function edit(record?: Model, parentId = '') {
  draft.value = record
    ? { ...record }
    : {
        parentId: parentId || undefined,
        sortIndex: nextOrganizationOrder(tree.data.value, parentId),
      }
}
async function save(value: Model) {
  await task.run(async () => {
    validateOrganization(value, tree.data.value)
    const response = value.id
      ? await api.updateDepartment_api({ ...value, id: stringValue(value.id) })
      : await api.addDepartment_api(value)
    const result = resultOf(response)
    if (isRecord(result) && result.id) {
      selected.value = stringValue(result.id)
      if (finishRelatedSave(route.query.sourceId, selected.value)) return
    }
    saved()
    draft.value = undefined
    await load()
  })
}
async function remove(id: string) {
  await task.run(async () => {
    await api.delDepartment_api(id)
    deleted()
    await load()
  })
}
function showMembers(id: string) {
  positionId.value = id
  active.value = 'users'
}
watch(selected, () => {
  positionId.value = ''
})
onMounted(async () => {
  await load()
  if (route.query.save) edit()
})
</script>
<template>
  <page-container :title="t('system.departments')"
    ><div class="department-workspace panel">
      <aside class="department-tree">
        <a-input-search
          v-model:value="search"
          :placeholder="t('common.name')"
          allow-clear
          @search="load"
        /><permission-button
          permission="system/Department:add"
          type="primary"
          class="department-add"
          @click="edit()"
          >{{ t('common.add') }}</permission-button
        >
        <load-state :loading="tree.loading.value" :error="tree.error.value" @retry="load"
          ><a-tree
            :tree-data="treeNodes(tree.data.value)"
            :field-names="{ title: 'name', key: 'id', children: 'children' }"
            :selected-keys="selected ? [selected] : []"
            block-node
            default-expand-all
            @select="
              (keys) => {
                if (keys.length) selected = String(keys[0])
              }
            "
            ><template #title="row"
              ><div class="department-node">
                <span>{{ row.name }}</span
                ><a-space :size="0" @click.stop
                  ><permission-button
                    permission="system/Department:update"
                    type="link"
                    :title="t('common.edit')"
                    @click="edit(row.dataRef || row)"
                    ><edit-outlined /></permission-button
                  ><permission-button
                    permission="system/Department:add"
                    type="link"
                    :title="t('organization.addChild')"
                    @click="edit(undefined, row.id)"
                    ><plus-circle-outlined /></permission-button
                  ><a-popconfirm :title="t('common.confirmDelete')" @confirm="remove(row.id)"
                    ><permission-button
                      permission="system/Department:delete"
                      type="link"
                      danger
                      :title="t('common.delete')"
                      ><delete-outlined /></permission-button></a-popconfirm
                ></a-space></div></template></a-tree
        ></load-state>
      </aside>
      <section class="department-content">
        <a-alert v-if="task.error.value" type="error" :message="task.error.value" /><a-tabs
          v-if="current"
          v-model:active-key="active"
          destroy-inactive-tab-pane
        >
          <a-tab-pane key="positions" :tab="t('system.positions')"
            ><department-positions :org-id="current.id" @members="showMembers"
          /></a-tab-pane>
          <a-tab-pane key="users" :tab="t('system.users')"
            ><user-binding
              :scope="{ type: 'org', id: current.id, positionId, permission: 'system/Department' }"
          /></a-tab-pane> </a-tabs
        ><a-empty v-else />
      </section>
    </div>
    <organization-editor
      v-model="draft"
      :tree="tree.data.value"
      :busy="task.busy.value"
      :error="task.error.value"
      @save="save"
    />
  </page-container>
</template>
<style scoped>
.department-workspace {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
}
.department-tree {
  min-width: 0;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}
.department-add {
  width: 100%;
  margin: 12px 0;
}
.department-content {
  min-width: 0;
}
.department-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.department-node > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.department-node :deep(.ant-btn) {
  padding: 2px 4px;
}
@media (width <= 900px) {
  .department-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
