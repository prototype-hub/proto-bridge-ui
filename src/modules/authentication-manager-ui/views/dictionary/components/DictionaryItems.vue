<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { Space as ASpace } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { EditOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import { dictionaryItemDefinition } from '@/modules/authentication-manager-ui/views/dictionary/definition'
import { queryDicItemNoPage } from '@/modules/authentication-manager-ui/api/dictionary/dictionary'
import { recordsOf, displayValue } from '@/modules/authentication-manager-ui/utils/model'
import { useEntity } from '@/modules/authentication-manager-ui/views/dictionary/hooks/useEntity'
import QueryTable from '@/shared/components/QueryTable.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import RecordEditor from '@/modules/authentication-manager-ui/components/forms/RecordEditor.vue'
const props = defineProps({
  dictionary: { type: Object as PropType<SystemRecord>, required: true },
})
const { t } = useI18n()
const definition = computed(() => dictionaryItemDefinition(props.dictionary.id))
const state = useEntity(definition)
const columns = computed(() => [
  ...['name', 'value', 'text'].map((key) => ({
    title: t(`organization.item${key[0].toUpperCase()}${key.slice(1)}`),
    dataIndex: key,
  })),
  { title: t('common.actions'), key: 'actions', dataIndex: 'actions', width: 104 },
])
async function add() {
  const ordinal = await state.task.run(async () => {
    const items = recordsOf(
      await queryDicItemNoPage({
        paging: false,
        sorts: [{ name: 'ordinal', order: 'desc' }],
        terms: [{ column: 'dictId', termType: 'eq', value: props.dictionary.id }],
      }),
    )
    return Math.max(0, ...items.map((row) => Number(row.ordinal) || 0)) + 1
  })
  if (ordinal === undefined) return
  await state.edit()
  if (state.draft.value) state.draft.value = { ...state.draft.value, ordinal }
}
</script>
<template>
  <div class="stack">
    <query-table
      :panel="false"
      target="system_dictionary"
      :fields="[
        { key: 'searchCode', label: 'organization.searchCode' },
        { key: 'name', label: 'organization.itemName' },
        { key: 'value', label: 'organization.itemValue' },
        { key: 'text', label: 'organization.itemText' },
      ]"
      :rows="state.list.data.value"
      :columns="columns"
      :pagination="state.pagination"
      :loading="state.list.loading.value"
      :error="state.list.error.value"
      :action-error="state.task.error.value"
      @search="state.search"
      @page="state.page"
      @refresh="state.list.load"
      @retry="state.list.load"
    >
      <template #toolbar>
        <permission-button permission="system/Dictionary:add" type="primary" @click="add">{{
          t('common.add')
        }}</permission-button>
      </template>
      <template #cell="{ record, column }"
        ><a-space v-if="column.key === 'actions'" :size="8">
          <action-button
            :label="t('common.edit')"
            :icon="EditOutlined"
            permission="system/Dictionary:update"
            @action="state.edit(record)"
          />
          <action-button
            :label="t('common.delete')"
            :icon="DeleteOutlined"
            permission="system/Dictionary:delete"
            danger
            :confirm="t('common.confirmDelete')"
            @action="state.remove(record.id)"
          /> </a-space
        ><span v-else>{{ displayValue(record[column.dataIndex]) }}</span></template
      >
    </query-table>
    <record-editor
      v-model="state.draft.value"
      :fields="definition.fields"
      :context="state.context.value"
      :state="{
        busy: state.task.busy.value,
        error: state.task.error.value,
        title: t(state.editing.value ? 'common.edit' : 'common.add'),
      }"
      @save="state.save"
    />
  </div>
</template>
<style scoped>
.stack {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
}
</style>
