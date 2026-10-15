import { computed, ref, watch, type Ref } from 'vue'
import type { PageResult, Query } from '@/shared/api/types'
import type { ManagedUser } from '@/modules/authentication-manager-ui/types/user'
import { roleIdentityApi } from '@/modules/authentication-manager-ui/api/role/role-options'
import { rolesApi } from '@/modules/authentication-manager-ui/api/role/roles'
import { useQueryList } from '@/shared/composables/useQueryList'
import { useTask } from '@/shared/composables/useTask'
import { saved } from '@/shared/utils/feedback'
export function useRoleMembers(role: Ref<string>) {
  const task = useTask(),
    open = ref(false),
    selected = ref<string[]>([]),
    selectedCandidates = ref<string[]>([])
  function emptyPage(query: Query): PageResult<ManagedUser> {
    return { data: [], total: 0, pageIndex: 0, pageSize: query.pageSize || 20 }
  }
  const memberList = useQueryList(
    (query, options) =>
      role.value
        ? roleIdentityApi.roleUsers(role.value, query, false, options)
        : Promise.resolve(emptyPage(query)),
    { immediate: false },
  )
  const candidateList = useQueryList(
    (query, options) =>
      role.value && open.value
        ? roleIdentityApi.roleUsers(role.value, query, true, options)
        : Promise.resolve(emptyPage(query)),
    { immediate: false },
  )
  // Preserve the existing row-array contract while the shared hook owns each PageResult and total.
  const members = { ...memberList, data: computed(() => memberList.data.value.data) }
  const candidates = { ...candidateList, data: computed(() => candidateList.data.value.data) }
  watch(
    role,
    () => {
      // A different role starts a fresh membership session; load also aborts the previous requests.
      selected.value = []
      selectedCandidates.value = []
      open.value = false
      memberList.queryState.value = { terms: [] }
      candidateList.queryState.value = { terms: [] }
      memberList.pagination.current = 1
      candidateList.pagination.current = 1
      memberList.data.value = emptyPage(memberList.requestQuery.value)
      candidateList.data.value = emptyPage(candidateList.requestQuery.value)
      void memberList.load()
      void candidateList.load()
    },
    { immediate: true },
  )
  async function add() {
    selectedCandidates.value = []
    open.value = true
    await candidates.load()
  }
  async function bind() {
    await task.run(async () => {
      if (!selectedCandidates.value.length) return
      await rolesApi.bind(role.value, selectedCandidates.value)
      saved()
      open.value = false
      await members.load()
    })
  }
  async function unbind(ids = selected.value) {
    await task.run(async () => {
      if (!ids.length) return
      await rolesApi.unbind(role.value, ids)
      saved()
      selected.value = []
      await members.load()
    })
  }
  return {
    members,
    candidates,
    task,
    open,
    selected,
    selectedCandidates,
    pagination: memberList.pagination,
    candidatePagination: candidateList.pagination,
    search: memberList.search,
    page: memberList.page,
    candidateSearch: candidateList.search,
    candidatePage: candidateList.page,
    add,
    bind,
    unbind,
  }
}
