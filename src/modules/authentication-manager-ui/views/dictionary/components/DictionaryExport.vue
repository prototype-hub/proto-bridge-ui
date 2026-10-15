<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Modal as AModal } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useOrganizationRecords } from '@/modules/authentication-manager-ui/hooks/useOrganizationRecords'
import { getDic_page, downDic } from '@/modules/authentication-manager-ui/api/dictionary/dictionary'
import { exportDictionaryQuery } from '@/modules/authentication-manager-ui/views/dictionary/definition'
import { displayValue, resultOf } from '@/modules/authentication-manager-ui/utils/model'
import { downloadJson } from '@/modules/authentication-manager-ui/utils/files'
import { useTask } from '@/shared/composables/useTask'
import QueryTable from '@/shared/components/QueryTable.vue'
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const selected = ref<string[]>([]),
  task = useTask(),
  state = useOrganizationRecords(getDic_page)
const columns = computed(() => [
  { title: t('organization.dictionaryName'), dataIndex: 'name' },
  { title: t('organization.dictionaryId'), dataIndex: 'id' },
])
async function save() {
  await task.run(async () => {
    if (!selected.value.length) return
    downloadJson(
      resultOf(await downDic(exportDictionaryQuery(selected.value))),
      `dictionary-${new Date().toISOString().slice(0, 10)}.json`,
    )
    emit('close')
  })
}
onMounted(state.load)
</script>
<template>
  <a-modal
    open
    :title="t('organization.exportSelected')"
    :width="900"
    :confirm-loading="task.busy.value"
    :ok-button-props="{ disabled: !selected.length }"
    @cancel="emit('close')"
    @ok="save"
  >
    <query-table
      :panel="false"
      :fields="[
        { key: 'name', label: 'organization.dictionaryName' },
        { key: 'id', label: 'organization.dictionaryId' },
      ]"
      :loading="state.loading.value"
      :error="state.error.value"
      :action-error="task.error.value"
      :rows="state.data.value"
      :columns="columns"
      :pagination="state.pagination"
      :table-props="{
        rowSelection: {
          selectedRowKeys: selected,
          preserveSelectedRowKeys: true,
          onChange: (keys: (string | number)[]) => (selected = keys.map(String)),
        },
      }"
      @search="state.search"
      @page="state.page"
      @refresh="state.load"
      @retry="state.load"
      ><template #cell="{ record, column }">{{
        displayValue(record[column.dataIndex])
      }}</template></query-table
    >
    <span>{{ t('system.selected') }} {{ selected.length }}</span>
  </a-modal>
</template>
