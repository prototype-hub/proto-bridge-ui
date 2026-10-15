<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import {
  InputSearch as AInputSearch,
  Switch as ASwitch,
  Tooltip as ATooltip,
  Popconfirm as APopconfirm,
  Space as ASpace,
  Alert as AAlert,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { Model, SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import { dictionaryDefinition } from '@/modules/authentication-manager-ui/views/dictionary/definition'
import * as api from '@/modules/authentication-manager-ui/api/dictionary/dictionary'
import { recordsOf, isRecord } from '@/modules/authentication-manager-ui/utils/model'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { saved, deleted } from '@/shared/utils/feedback'
import { usePermissions } from '@/shared/auth/provider'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import LoadState from '@/shared/components/LoadState.vue'
import RecordEditor from '@/modules/authentication-manager-ui/components/forms/RecordEditor.vue'
import DictionaryExport from '@/modules/authentication-manager-ui/views/dictionary/components/DictionaryExport.vue'
const emit = defineEmits<{ select: [record: SystemRecord | undefined] }>()
const { t } = useI18n()
const search = ref(''),
  selected = ref(''),
  draft = ref<Model>(),
  exportOpen = ref(false),
  task = useTask()
const permissions = usePermissions()
const canToggle = computed(() => permissions.can('system/Dictionary:action'))
const list = useResource(
  async () =>
    recordsOf(
      await api.getDicList({
        paging: false,
        sorts: [
          { name: 'createTime', order: 'desc' },
          { name: 'name', order: 'desc' },
        ],
        terms: search.value
          ? [{ terms: [{ column: 'name', termType: 'like', value: `%${search.value}%` }] }]
          : [],
      }),
    ),
  [],
)
function select(row?: SystemRecord) {
  selected.value = row?.id || ''
  emit('select', row)
}
async function reload(first = false) {
  await list.load()
  select((!first && list.data.value.find((row) => row.id === selected.value)) || list.data.value[0])
}
function edit(row?: SystemRecord) {
  draft.value = row ? { ...row, __editing: true } : { status: 1 }
}
async function save(value: Model) {
  await task.run(async () => {
    const { __editing: editing, ...body } = value
    await dictionaryDefinition.validate?.(body, editing === true)
    await api.addDictionary(body)
    saved()
    draft.value = undefined
    await reload()
  })
}
async function toggle(row: SystemRecord) {
  await task.run(async () => {
    await api.addDictionary({ ...row, status: row.status === 1 ? 0 : 1 })
    saved()
    await reload()
  })
}
async function remove(row: SystemRecord) {
  await task.run(async () => {
    await api.deleteDictionary(row.id)
    deleted()
    await reload()
  })
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  await task.run(async () => {
    const parsed: unknown = JSON.parse(await file.text()),
      rows = Array.isArray(parsed) ? parsed : [parsed]
    if (!rows.every(isRecord)) throw new Error(t('common.invalid'))
    await api.addDictionary(rows)
    saved()
    await reload()
  })
  input.value = ''
}
onMounted(() => reload(true))
</script>
<template>
  <div class="dictionary-left">
    <a-input-search
      v-model:value="search"
      allow-clear
      :placeholder="t('organization.dictionaryName')"
      @search="reload(true)"
    />
    <a-space wrap class="dictionary-toolbar"
      ><permission-button permission="system/Dictionary:add" type="primary" @click="edit()">{{
        t('common.add')
      }}</permission-button
      ><permission-button permission="system/Dictionary:down" @click="exportOpen = true">{{
        t('system.export')
      }}</permission-button
      ><permission-button permission="system/Dictionary:import"
        ><label class="dictionary-import"
          >{{ t('system.import')
          }}<input
            type="file"
            accept="application/json,.json"
            :aria-label="t('system.import')"
            @change="importFile" /></label></permission-button
    ></a-space>
    <a-alert v-if="task.error.value" :message="task.error.value" type="error" /><load-state
      :loading="list.loading.value"
      :error="list.error.value"
      @retry="reload()"
      ><div class="dictionary-list">
        <div
          v-for="row in list.data.value"
          :key="row.id"
          :class="['dictionary-row', { active: row.id === selected }]"
        >
          <button class="dictionary-name" :title="row.name" @click="select(row)">
            {{ row.name }}</button
          ><a-space :size="4">
            <a-popconfirm
              v-if="row.classified !== 'system' && canToggle"
              :title="t('organization.changeStatus')"
              @confirm="toggle(row)"
              ><a-switch
                :checked="row.status === 1"
                :loading="task.busy.value"
                size="small" /></a-popconfirm
            ><a-tooltip
              v-else
              :title="
                row.classified === 'system'
                  ? t('organization.systemDictionary')
                  : t('common.forbidden')
              "
              ><a-switch :checked="row.status === 1" size="small" disabled
            /></a-tooltip>
            <permission-button
              permission="system/Dictionary:update"
              type="link"
              :disabled="row.classified === 'system'"
              @click="edit(row)"
              >{{ t('common.edit') }}</permission-button
            ><a-popconfirm :title="t('common.confirmDelete')" @confirm="remove(row)"
              ><permission-button
                permission="system/Dictionary:delete"
                type="link"
                danger
                :disabled="row.classified === 'system'"
                >{{ t('common.delete') }}</permission-button
              ></a-popconfirm
            >
          </a-space>
        </div>
      </div></load-state
    >
    <record-editor
      v-model="draft"
      :fields="dictionaryDefinition.fields"
      :state="{
        busy: task.busy.value,
        error: task.error.value,
        title: t(draft?.__editing ? 'common.edit' : 'common.add'),
      }"
      @save="save"
    />
    <dictionary-export v-if="exportOpen" @close="exportOpen = false" />
  </div>
</template>
<style scoped>
.dictionary-left {
  min-width: 0;
}
.dictionary-toolbar {
  margin: 12px 0;
}
.dictionary-list {
  max-height: calc(100vh - 290px);
  overflow-y: auto;
}
.dictionary-row {
  display: flex;
  align-items: center;
  padding: 6px 4px;
  border-radius: 4px;
}
.dictionary-row.active {
  background: #e6f7ff;
}
.dictionary-name {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 4px;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dictionary-import {
  position: relative;
  cursor: pointer;
}
.dictionary-import input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}
</style>
