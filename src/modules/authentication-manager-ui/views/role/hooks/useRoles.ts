import { ref, onMounted } from 'vue'
import { rolesApi } from '@/modules/authentication-manager-ui/api/role/roles'
import { roleIdentityApi } from '@/modules/authentication-manager-ui/api/role/role-options'
import { usePaged } from '@/shared/composables/usePaged'
import { useTask } from '@/shared/composables/useTask'
import { saved, deleted } from '@/shared/utils/feedback'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import type { Role } from '@/modules/authentication-manager-ui/types/role'
import { useRoute } from 'vue-router'
import { finishRelatedSave } from '@/modules/authentication-manager-ui/utils/related-record'
import { scopedIdentityTerms } from '@/modules/authentication-manager-ui/utils/identity'
export function useRoles() {
  const route = useRoute()
  const group = ref(''),
    groups = ref<SystemRecord[]>([]),
    groupSearch = ref('')
  const list = usePaged((query, options) =>
    rolesApi.list(
      {
        ...query,
        terms: scopedIdentityTerms(
          query.terms,
          group.value ? [{ column: 'groupId', termType: 'eq', value: group.value }] : [],
        ),
        sorts: [
          { name: 'createTime', order: 'desc' },
          { name: 'id', order: 'desc' },
        ],
      },
      options,
    ),
  )
  const task = useTask(),
    groupOpen = ref(false),
    groupForm = ref({ id: '', name: '' })
  async function loadGroups() {
    const rows = await roleIdentityApi.groups(groupSearch.value)
    groups.value = rows.sort((a, b) =>
      a.id === 'default_group' ? -1 : b.id === 'default_group' ? 1 : 0,
    )
  }
  async function selectGroup(value: string) {
    group.value = value
    await list.query()
  }
  function editGroup(row?: SystemRecord) {
    if (row?.id === 'default_group') return
    groupForm.value = { id: row?.id || crypto.randomUUID(), name: row?.name || '' }
    groupOpen.value = true
  }
  async function saveGroup() {
    await task.run(async () => {
      await roleIdentityApi.saveGroup(groupForm.value)
      saved()
      groupOpen.value = false
      await loadGroups()
    })
  }
  async function removeGroup(id: string) {
    if (id === 'default_group') return
    await task.run(async () => {
      await roleIdentityApi.deleteGroup(id)
      deleted()
      if (group.value === id) await selectGroup('')
      await loadGroups()
    })
  }
  onMounted(async () => {
    await loadGroups()
    if (route.query.save) edit()
  })
  const open = ref(false),
    creating = ref(false),
    selected = ref<Role>()
  const form = ref<Role>({ id: '', name: '', description: '' })
  function edit(role?: Role) {
    creating.value = !role
    form.value = role
      ? { ...role }
      : { id: '', name: '', description: '', groupId: group.value || 'default_group' }
    open.value = true
  }
  async function save() {
    await task.run(async () => {
      const response = await (creating.value
        ? rolesApi.create(form.value)
        : rolesApi.save(form.value))
      saved()
      open.value = false
      await list.load()
      if (
        creating.value &&
        response.result &&
        typeof response.result === 'object' &&
        'id' in response.result
      )
        if (!finishRelatedSave(route.query.sourceId, String(response.result.id)))
          selected.value = response.result as Role
    })
  }
  async function remove(id: string) {
    await task.run(async () => {
      await rolesApi.remove(id)
      deleted()
      await list.load()
    })
  }
  return {
    group,
    groups,
    groupSearch,
    groupOpen,
    groupForm,
    loadGroups,
    selectGroup,
    searchRoles: list.searchQuery,
    editGroup,
    saveGroup,
    removeGroup,
    list,
    task,
    open,
    creating,
    form,
    selected,
    edit,
    save,
    remove,
  }
}
