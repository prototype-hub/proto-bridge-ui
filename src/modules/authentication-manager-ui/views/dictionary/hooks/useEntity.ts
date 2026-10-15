import { ref, shallowRef, computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQueryList } from '@/shared/composables/useQueryList'
import { useTask } from '@/shared/composables/useTask'
import { saved, deleted } from '@/shared/utils/feedback'
import type { Model, SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import type { EntityDefinition } from '@/modules/authentication-manager-ui/types/dictionary'
import type { FormContext } from '@/modules/authentication-manager-ui/types/forms'
import {
  recordsOf,
  resultOf,
  isRecord,
  getValue,
  setValue,
} from '@/modules/authentication-manager-ui/utils/model'
import { formOptions } from '@/modules/authentication-manager-ui/hooks/form-options'
import { downloadJson } from '@/modules/authentication-manager-ui/utils/files'
import { t } from '@/shared/i18n'
export function useEntity(source: MaybeRefOrGetter<EntityDefinition>) {
  const definition = () => toValue(source)
  const task = useTask()
  const draft = ref<Model>()
  const editing = ref(false)
  const context = shallowRef<FormContext>({})
  const queryList = useQueryList<SystemRecord>(
    async (query) => {
      // Legacy entity APIs have no RequestOptions; useQueryList still commits only the latest result.
      const response = await definition().query(query)
      const result = resultOf(response),
        rows = recordsOf(response)
      return {
        data: rows,
        total: isRecord(result) && typeof result.total === 'number' ? result.total : rows.length,
        pageIndex: query.pageIndex || 0,
        pageSize: query.pageSize || 20,
      }
    },
    {
      immediate: true,
      beforeQuery: (query) => ({ ...query, sorts: [{ name: 'createTime', order: 'desc' }] }),
    },
  )
  const list = { ...queryList, data: computed(() => queryList.data.value.data) }
  async function edit(record?: Model) {
    await task.run(async () => {
      if (record && definition().editable && !definition().editable!(record)) return
      context.value = await formOptions(
        definition()
          .fields.map((field) => field.source || '')
          .filter(Boolean),
      )
      editing.value = !!record
      const value = {
        ...(JSON.parse(JSON.stringify(definition().defaults || {})) as Model),
        ...record,
        __editing: !!record,
      }
      for (const field of definition().fields.filter((field) => field.kind === 'multiple')) {
        const selected = getValue(value, field.key)
        if (Array.isArray(selected))
          setValue(
            value,
            field.key,
            selected.map((item) => (isRecord(item) ? item.id : item)),
          )
      }
      draft.value = value
    })
  }
  async function save(value: Model) {
    await task.run(async () => {
      const { __editing: _editing, ...data } = value
      await definition().validate?.(data, editing.value)
      await definition().save?.(data, editing.value)
      saved()
      draft.value = undefined
      await list.load()
    })
  }
  async function remove(id: string) {
    await task.run(async () => {
      const row = list.data.value.find((item) => item.id === id)
      if (row && definition().editable && !definition().editable!(row)) return
      await definition().remove?.(id)
      deleted()
      await list.load()
    })
  }
  async function exportRecords() {
    await task.run(async () => {
      const response = definition().export
        ? await definition().export!(queryList.queryState.value)
        : await definition().query({ ...queryList.queryState.value, paging: false })
      downloadJson(resultOf(response), `${definition().key}.json`)
    })
  }
  async function importRecords(file: File) {
    await task.run(async () => {
      const value: unknown = JSON.parse(await file.text())
      const rows = Array.isArray(value) ? value : [value]
      if (!rows.every(isRecord)) throw new Error(t('common.invalid'))
      if (definition().import) await definition().import!(rows)
      else
        for (const row of rows) {
          await definition().validate?.(row, true)
          await definition().save?.(row, true)
        }
      saved()
      await list.load()
    })
  }
  return {
    list,
    task,
    draft,
    context,
    editing,
    pagination: queryList.pagination,
    search: queryList.search,
    page: queryList.page,
    edit,
    save,
    remove,
    exportRecords,
    importRecords,
  }
}
