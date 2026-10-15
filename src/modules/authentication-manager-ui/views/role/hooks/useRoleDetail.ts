import { ref, watch, type Ref } from 'vue'
import type { Role } from '@/modules/authentication-manager-ui/types/role'
import { rolesApi } from '@/modules/authentication-manager-ui/api/role/roles'
import {
  normalizeGrants,
  serializeRoleGrants,
  type GrantMenu,
} from '@/modules/authentication-manager-ui/views/role/utils/role-grants'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { saved } from '@/shared/utils/feedback'
export function useRoleDetail(role: Ref<Role | undefined>) {
  const task = useTask(),
    grants = ref<GrantMenu[]>([])
  let loadedRoleId = ''
  const resource = useResource(async (signal) => {
    const roleId = role.value?.id
    loadedRoleId = ''
    if (!roleId) return []
    const result = normalizeGrants(await rolesApi.grants(roleId, { signal }))
    if (signal.aborted || role.value?.id !== roleId) return []
    grants.value = result
    loadedRoleId = roleId
    return grants.value
  }, [] as GrantMenu[])
  watch(role, () => {
    grants.value = []
    loadedRoleId = ''
    void resource.load()
  })
  const save = () =>
    task.run(async () => {
      const roleId = role.value?.id
      if (!roleId || loadedRoleId !== roleId || resource.loading.value || resource.error.value)
        return
      await rolesApi.grant(roleId, serializeRoleGrants(grants.value))
      saved()
    })
  return { resource, task, grants, save }
}
