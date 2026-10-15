<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { Drawer as ADrawer, Button as AButton } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { UserAddOutlined } from '@ant-design/icons-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import { queryPage } from '@/modules/authentication-manager-ui/api/position/positions'
import { useOrganizationRecords } from '@/modules/authentication-manager-ui/hooks/useOrganizationRecords'
import { displayValue } from '@/modules/authentication-manager-ui/utils/model'
import { scopedQueryTerms } from '@/modules/authentication-manager-ui/utils/query-scope'
import QueryTable from '@/shared/components/QueryTable.vue'
import UserBinding from '@/modules/authentication-manager-ui/components/membership/UserBinding.vue'
const props = defineProps<{ orgId: string }>()
const emit = defineEmits<{ members: [id: string] }>()
const { t } = useI18n()
const selected = ref<SystemRecord>(),
  binding = ref<InstanceType<typeof UserBinding>>()
const state = useOrganizationRecords((query) =>
  queryPage({
    ...query,
    terms: scopedQueryTerms(query.terms, [{ column: 'orgId', termType: 'eq', value: props.orgId }]),
  }),
)
const columns = computed(() => [
  { title: t('system.id'), dataIndex: 'id' },
  { title: t('common.name'), dataIndex: 'name' },
  { title: t('organization.memberCount'), dataIndex: 'memberCount' },
  { title: t('system.description'), dataIndex: 'description' },
  { title: t('common.actions'), key: 'actions', dataIndex: 'actions', width: 64 },
])
async function bindUsers(record: SystemRecord) {
  selected.value = record
  await nextTick()
  await binding.value?.add()
}
async function bound() {
  selected.value = undefined
  await state.load()
}
watch(
  () => props.orgId,
  () => {
    selected.value = undefined
    void state.search({ terms: [] })
  },
  { immediate: true },
)
</script>
<template>
  <div class="stack">
    <query-table
      :panel="false"
      target="category-position"
      :fields="[
        { key: 'id', label: 'system.id' },
        { key: 'name', label: 'common.name' },
        { key: 'description', label: 'system.description' },
      ]"
      :rows="state.data.value"
      :columns="columns"
      :pagination="state.pagination"
      :loading="state.loading.value"
      :error="state.error.value"
      @search="state.search"
      @page="state.page"
      @refresh="state.load"
      @retry="state.load"
      ><template #cell="{ record, column }"
        ><a-button
          v-if="column.dataIndex === 'memberCount'"
          type="link"
          @click="emit('members', record.id)"
          >{{ record.memberCount || 0 }}</a-button
        ><action-button
          v-else-if="column.key === 'actions'"
          :label="t('organization.bindUser')"
          :icon="UserAddOutlined"
          permission="system/Department:bind-user"
          @action="bindUsers(record)"
        /><span v-else>{{ displayValue(record[column.dataIndex]) }}</span></template
      ></query-table
    >
    <a-drawer
      :open="!!selected"
      :title="selected?.name"
      :width="'min(1000px, 100vw)'"
      @close="selected = undefined"
      ><user-binding
        v-if="selected"
        ref="binding"
        :scope="{
          type: 'position',
          id: selected.id,
          orgId,
          permission: 'system/Department',
          bindAction: 'bind-user',
        }"
        @changed="bound"
    /></a-drawer>
  </div>
</template>
