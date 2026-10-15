import { ref } from 'vue'
import { permissionsApi } from '@/modules/authentication-manager-ui/api/permission/resources'
import type { PermissionResource } from '@/modules/authentication-manager-ui/types/permission'
import { usePaged } from '@/shared/composables/usePaged'
import { useTask } from '@/shared/composables/useTask'
import { saved, deleted } from '@/shared/utils/feedback'
import { downloadJson } from '@/modules/authentication-manager-ui/utils/files'
import { isRecord } from '@/modules/authentication-manager-ui/utils/model'
import { enabled } from '@/modules/authentication-manager-ui/utils/identity'
import { t } from '@/shared/i18n'
export function defaultPermissionActions() {
  return ['query', 'save', 'delete'].map((action) => ({
    action,
    name: t(`identity.${action}Action`),
    describe: t(`identity.${action}Action`),
  }))
}
export function usePermissionResources() {
  const list = usePaged((query, options) =>
    permissionsApi.list({ ...query, sorts: [{ name: 'id', order: 'asc' }] }, options),
  )
  const task = useTask(),
    draft = ref<PermissionResource>(),
    editing = ref(false)
  function edit(record?: PermissionResource) {
    editing.value = !!record
    draft.value = record
      ? (JSON.parse(JSON.stringify(record)) as PermissionResource)
      : { id: '', name: '', actions: defaultPermissionActions() }
  }
  async function save() {
    await task.run(async () => {
      if (!draft.value) return
      if (!editing.value) {
        const validation = await permissionsApi.validate(draft.value.id)
        if (!validation.passed) throw new Error(validation.reason || t('common.invalid'))
      }
      const actions = draft.value.actions
      if (new Set(actions.map((action) => action.action)).size !== actions.length)
        throw new Error(t('identity.duplicateAction'))
      await (editing.value ? permissionsApi.save(draft.value) : permissionsApi.create(draft.value))
      saved()
      draft.value = undefined
      await list.load()
    })
  }
  async function status(record: PermissionResource) {
    await task.run(async () => {
      await permissionsApi.save({ ...record, status: enabled(record.status) ? 0 : 1 })
      saved()
      await list.load()
    })
  }
  async function remove(record: PermissionResource) {
    if (enabled(record.status)) return
    await task.run(async () => {
      await permissionsApi.remove(record.id)
      deleted()
      await list.load()
    })
  }
  async function importFile(file: File) {
    await task.run(async () => {
      const data: unknown = JSON.parse(await file.text())
      const rows = Array.isArray(data) ? data : [data]
      if (
        !rows.every(
          (row) =>
            isRecord(row) &&
            typeof row.id === 'string' &&
            typeof row.name === 'string' &&
            Array.isArray(row.actions),
        )
      )
        throw new Error(t('common.invalid'))
      await permissionsApi.save(rows)
      saved()
      await list.load()
    })
  }
  async function exportFile() {
    await task.run(async () => {
      const response = await permissionsApi.export(list.queryState.value)
      downloadJson(response.result, 'permission.json')
    })
  }
  return {
    list,
    task,
    draft,
    editing,
    search: list.searchQuery,
    edit,
    save,
    status,
    remove,
    importFile,
    exportFile,
  }
}
