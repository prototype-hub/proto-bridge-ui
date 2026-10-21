import { ref, shallowRef, watch, onScopeDispose, type Ref } from 'vue'
import { projectsApi } from '@/modules/protohub-manager-ui/api'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import type { Project, ProjectMember, MemberCandidate } from '@/modules/protohub-manager-ui/types'

/** Own requests for one open member dialog; closing, project changes and lost scope invalidate every callback. */
export function useProjectMembers(
  project: Ref<Project | undefined>,
  open: Ref<boolean>,
  changed: () => void,
) {
  const members = shallowRef<ProjectMember[]>([])
  const candidates = shallowRef<MemberCandidate[]>([])
  const loading = ref(false)
  const searching = ref(false)
  const busy = ref(false)
  const error = ref('')
  const searchError = ref('')
  const userId = ref<string>()
  const role = ref<'editor' | 'viewer'>('viewer')
  let generation = 0
  let memberRequest: AbortController | undefined
  let candidateRequest: AbortController | undefined
  let mutationRequest: AbortController | undefined
  let searchTimer: ReturnType<typeof setTimeout> | undefined

  const allowed = () => open.value && projectAllows(project.value, 'manageMembers')
  function clear() {
    generation++
    memberRequest?.abort()
    candidateRequest?.abort()
    mutationRequest?.abort()
    clearTimeout(searchTimer)
    members.value = []
    candidates.value = []
    loading.value = false
    searching.value = false
    busy.value = false
    error.value = ''
    searchError.value = ''
    userId.value = undefined
    role.value = 'viewer'
  }
  function message(cause: unknown) {
    return cause instanceof Error ? cause.message : t('common.unknown')
  }
  function accessRejected(cause: unknown) {
    if (!(cause instanceof ApiError) || ![403, 404].includes(cause.status)) return false
    // One rejected scope check invalidates sibling requests, including a candidate search already in flight.
    clear()
    error.value = message(cause)
    changed()
    return true
  }
  async function load() {
    if (!allowed() || !project.value) return
    const id = project.value.id
    const current = generation
    memberRequest?.abort()
    const request = new AbortController()
    memberRequest = request
    members.value = []
    loading.value = true
    error.value = ''
    try {
      const result = await projectsApi.members(id, { signal: request.signal, silent: true })
      if (current === generation && !request.signal.aborted) members.value = result
    } catch (cause) {
      if (current === generation && !request.signal.aborted && !accessRejected(cause))
        error.value = message(cause)
    } finally {
      if (current === generation && memberRequest === request) loading.value = false
    }
  }
  async function findCandidates(keyword: string) {
    if (!allowed() || !project.value) return
    const id = project.value.id
    const current = generation
    candidateRequest?.abort()
    const request = new AbortController()
    candidateRequest = request
    searching.value = true
    candidates.value = []
    searchError.value = ''
    try {
      const result = await projectsApi.candidates(id, keyword.trim(), {
        signal: request.signal,
        silent: true,
      })
      if (current === generation && !request.signal.aborted) candidates.value = result
    } catch (cause) {
      if (current === generation && !request.signal.aborted && !accessRejected(cause))
        searchError.value = message(cause)
    } finally {
      if (current === generation && candidateRequest === request) searching.value = false
    }
  }
  function search(keyword: string) {
    clearTimeout(searchTimer)
    // Stop the old search now; its result must not refill options during the debounce window.
    candidateRequest?.abort()
    candidates.value = []
    searchTimer = setTimeout(() => void findCandidates(keyword), 250)
  }
  async function mutate(
    action: (id: string, options: { signal: AbortSignal; silent: boolean }) => Promise<unknown>,
  ) {
    if (!allowed() || !project.value || busy.value) return
    const id = project.value.id
    const current = generation
    const request = new AbortController()
    mutationRequest = request
    busy.value = true
    error.value = ''
    try {
      await action(id, { signal: request.signal, silent: true })
      if (current !== generation || request.signal.aborted) return
      userId.value = undefined
      await load()
      if (current === generation) changed()
    } catch (cause) {
      if (
        current !== generation ||
        request.signal.aborted ||
        (cause instanceof ApiError && cause.cancelled)
      )
        return
      if (!accessRejected(cause)) error.value = message(cause)
    } finally {
      if (current === generation) busy.value = false
    }
  }
  function save(selectedUserId = userId.value, selectedRole = role.value) {
    if (!selectedUserId || !['editor', 'viewer'].includes(selectedRole)) return Promise.resolve()
    if (members.value.some((member) => member.userId === selectedUserId && member.role === 'owner'))
      return Promise.resolve()
    return mutate((id, options) =>
      projectsApi.saveMember(id, selectedUserId, selectedRole, options),
    )
  }
  function remove(member: ProjectMember) {
    if (member.role === 'owner') return Promise.resolve()
    return mutate((id, options) => projectsApi.removeMember(id, member.userId, options))
  }
  function claim() {
    const selected = userId.value
    if (!selected || project.value?.role !== 'admin' || !project.value.claimRequired)
      return Promise.resolve()
    return mutate((id, options) => projectsApi.claim(id, selected, options))
  }
  watch(
    () => [
      open.value,
      project.value?.id,
      project.value?.capabilities?.manageMembers,
      project.value?.claimRequired,
    ],
    () => {
      clear()
      if (allowed()) {
        void load()
        void findCandidates('')
      }
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(clear)
  return {
    members,
    candidates,
    loading,
    searching,
    busy,
    error,
    searchError,
    userId,
    role,
    load,
    search,
    save,
    remove,
    claim,
  }
}
