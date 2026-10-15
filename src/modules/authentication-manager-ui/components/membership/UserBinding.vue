<script setup lang="ts">
import { ref, computed, watch, type PropType } from 'vue'
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
import type { QueryField } from '@/shared/api/types'
import type { BindingScope } from '@/modules/authentication-manager-ui/hooks/useBindingUsers'
import { useBindingUsers } from '@/modules/authentication-manager-ui/hooks/useBindingUsers'
import { displayValue, recordsOf } from '@/modules/authentication-manager-ui/utils/model'
import { queryPageNoPage } from '@/modules/authentication-manager-ui/api/position/positions'
import {
  bindUser_api,
  unBindUser_api,
} from '@/modules/authentication-manager-ui/api/department/department'
import { bindUser, unbindUser } from '@/modules/authentication-manager-ui/api/position/positions'
import {
  bindUser_api as bindRole,
  unbindUser_api as unbindRole,
} from '@/modules/authentication-manager-ui/api/role/role'
import { useTask } from '@/shared/composables/useTask'
import { saved } from '@/shared/utils/feedback'
import QueryTable from '@/shared/components/QueryTable.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
const props = defineProps({ scope: { type: Object as PropType<BindingScope>, required: true } })
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const open = ref(false),
  selected = ref<string[]>([]),
  memberSelection = ref<string[]>([])
const positionOptions = ref<{ value: string; label: string }[]>([])
const task = useTask()
const members = useBindingUsers(() => props.scope)
const candidates = useBindingUsers(() => props.scope, true)
const baseFields = computed<QueryField[]>(() => [
  { key: 'name', label: 'common.name' },
  { key: 'username', label: 'common.username' },
])
const fields = computed<QueryField[]>(() =>
  props.scope.type === 'org'
    ? [
        ...baseFields.value,
        {
          key: 'positions',
          label: 'organization.positions',
          type: 'select',
          rename: 'id$in-dimension$position',
          operators: ['eq'],
          options: positionOptions.value,
          restore: (term) =>
            term.column === 'id$in-dimension$position'
              ? { ...term, column: 'positions', termType: 'eq' }
              : term.column === 'positions'
                ? term
                : undefined,
          transform: (term) => ({
            ...term,
            column: 'id$in-dimension$position',
            termType: undefined,
          }),
        },
      ]
    : [
        ...baseFields.value,
        { key: 'createTime', label: 'system.createTime', type: 'date' },
        {
          key: 'status',
          label: 'common.status',
          type: 'select',
          options: [
            { label: t('common.enabled'), value: 1 },
            { label: t('common.disabled'), value: 0 },
          ],
        },
      ],
)
const columns = computed(() => [
  { title: t('common.name'), dataIndex: 'name' },
  { title: t('common.username'), dataIndex: 'username' },
  ...(props.scope.type === 'org'
    ? [{ title: t('organization.positions'), dataIndex: 'positions' }]
    : [
        { title: t('system.createTime'), dataIndex: 'createTime' },
        { title: t('common.status'), dataIndex: 'status' },
      ]),
  { title: t('common.actions'), key: 'actions', dataIndex: 'actions', width: 64 },
])
const bindPermission = computed(
  () =>
    `${props.scope.permission}:${props.scope.bindAction || (props.scope.type === 'position' ? 'update' : 'bind-user')}`,
)
const unbindPermission = computed(
  () =>
    `${props.scope.permission}:${props.scope.type === 'org' ? 'bind' : props.scope.bindAction || (props.scope.type === 'position' ? 'update' : 'bind-user')}`,
)
async function add() {
  selected.value = []
  open.value = true
  await candidates.search({ terms: [] })
}
async function bind() {
  await task.run(async () => {
    const ids = [...new Set(selected.value)]
    if (!ids.length) return
    if (props.scope.type === 'org') await bindUser_api(props.scope.id, ids)
    else if (props.scope.type === 'role') await bindRole(props.scope.id, ids)
    else await bindUser(props.scope.orgId || '', props.scope.id, ids)
    saved()
    open.value = false
    await members.load()
    emit('changed')
  })
}
async function unbind(ids: string[]) {
  await task.run(async () => {
    if (!ids.length) return
    if (props.scope.type === 'org') await unBindUser_api(props.scope.id, ids)
    else if (props.scope.type === 'role') await unbindRole(props.scope.id, ids)
    else await unbindUser(props.scope.orgId || '', props.scope.id, ids)
    saved()
    memberSelection.value = []
    await members.load()
    emit('changed')
  })
}
async function loadPositionOptions() {
  if (props.scope.type !== 'org') return
  await task.run(async () => {
    positionOptions.value = recordsOf(
      await queryPageNoPage({
        paging: false,
        terms: [{ column: 'orgId', value: props.scope.id }],
        sorts: [{ name: 'createTime', order: 'desc' }],
      }),
    ).map((row) => ({ value: row.id, label: row.name }))
  })
}
watch(
  () => [props.scope.type, props.scope.id],
  () => {
    selected.value = []
    memberSelection.value = []
    open.value = false
    void loadPositionOptions()
  },
  { immediate: true },
)
defineExpose({ add })
</script>
<template>
  <div class="stack">
    <query-table
      :panel="false"
      :target="
        scope.type === 'org'
          ? 'category-user'
          : scope.type === 'position'
            ? 'system-position-user'
            : 'system-role-user'
      "
      :fields="fields"
      :rows="members.data.value"
      :columns="columns"
      :pagination="members.pagination"
      :loading="members.loading.value"
      :error="members.error.value"
      :action-error="task.error.value"
      :table-props="{
        rowSelection: {
          selectedRowKeys: memberSelection,
          onChange: (keys: (string | number)[]) => (memberSelection = keys.map(String)),
        },
      }"
      @search="members.search"
      @page="members.page"
      @refresh="members.load"
      @retry="members.load"
    >
      <template #filters>
        <a-tag v-if="members.positionFilter.value" closable @close="members.clearPositionFilter"
          >{{ t('organization.positions') }}:
          {{
            positionOptions.find((option) => option.value === members.positionFilter.value)
              ?.label || members.positionFilter.value
          }}
        </a-tag>
      </template>
      <template #toolbar>
        <a-space wrap
          ><permission-button :permission="bindPermission" type="primary" @click="add">{{
            t('organization.bindUser')
          }}</permission-button>
          <a-popconfirm :title="t('common.confirmDelete')" @confirm="unbind(memberSelection)"
            ><permission-button
              :permission="unbindPermission"
              :disabled="!memberSelection.length || task.busy.value"
              >{{ t('system.batchUnbind') }}</permission-button
            ></a-popconfirm
          >
        </a-space>
      </template>
      <template #cell="{ column, record }"
        ><action-button
          v-if="column.key === 'actions'"
          :label="t('system.unbind')"
          :icon="DisconnectOutlined"
          :permission="unbindPermission"
          danger
          :confirm="t('common.confirmDelete')"
          @action="unbind([record.id])"
        />

        <span v-else-if="column.dataIndex === 'positions'">{{
          recordsOf(record.positions)
            .filter((row) => row.orgId === scope.id)
            .map((row) => row.name)
            .join(', ') || '--'
        }}</span>
        <a-tag
          v-else-if="column.dataIndex === 'status'"
          :color="record.status === 1 ? 'green' : 'red'"
          >{{ t(record.status === 1 ? 'common.enabled' : 'common.disabled') }}</a-tag
        >
        <span v-else-if="column.dataIndex === 'createTime'">{{
          record.createTime ? dayjs(Number(record.createTime)).format('YYYY-MM-DD HH:mm:ss') : '--'
        }}</span>
        <span v-else>{{ displayValue(record[column.dataIndex]) }}</span>
      </template>
    </query-table>
    <a-modal
      v-model:open="open"
      :title="t('organization.bindUser')"
      :width="900"
      :confirm-loading="task.busy.value"
      :ok-button-props="{ disabled: !selected.length }"
      @ok="bind"
    >
      <query-table
        :panel="false"
        :fields="baseFields"
        :loading="candidates.loading.value"
        :error="candidates.error.value"
        :action-error="task.error.value"
        :rows="candidates.data.value"
        :columns="columns.slice(0, 2)"
        :pagination="candidates.pagination"
        :table-props="{
          rowSelection: {
            selectedRowKeys: selected,
            preserveSelectedRowKeys: true,
            onChange: (keys: (string | number)[]) => (selected = keys.map(String)),
          },
        }"
        @search="candidates.search"
        @page="candidates.page"
        @refresh="candidates.load"
        @retry="candidates.load"
        ><template #cell="{ record, column }">{{
          displayValue(record[column.dataIndex])
        }}</template></query-table
      >
      <span>{{ t('system.selected') }} {{ selected.length }}</span>
    </a-modal>
  </div>
</template>
