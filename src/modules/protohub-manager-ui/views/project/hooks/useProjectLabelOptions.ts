import { onScopeDispose, ref, watch } from 'vue'
import { projectsApi } from '@/modules/protohub-manager-ui/api'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { trimProjectLabel } from '@/modules/protohub-manager-ui/utils/project-organization'
import { useProjectActor } from './useProjectActor'
import { usePermissions } from '@/shared/auth/provider'

/** Bounded distinct value pages are scoped by the server, independently from list filters. */
export function useProjectLabelOptions(kind: 'group' | 'tag') {
  const permissions = usePermissions()
  const values = ref<string[]>([]),
    total = ref(0),
    loading = ref(false),
    error = ref('')
  let page = -1,
    keyword = '',
    serial = 0,
    controller: AbortController | undefined
  function clear() {
    serial++
    controller?.abort()
    values.value = []
    total.value = 0
    page = -1
    loading.value = false
    error.value = ''
  }
  const actor = useProjectActor(clear)
  async function load(search = keyword, append = false) {
    if (
      !permissions.can(p.project.query) ||
      !actor.current() ||
      (append && (loading.value || values.value.length >= total.value))
    )
      return
    const epoch = actor.requirePermission(p.project.query)
    const current = ++serial
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    keyword = trimProjectLabel(search).slice(0, 64)
    const next = append ? page + 1 : 0
    if (!append) {
      values.value = []
      total.value = 0
    }
    loading.value = true
    error.value = ''
    try {
      const result = await projectsApi.organizationOptions(
        { kind, keyword, pageIndex: next, pageSize: 20 },
        { signal, silent: true },
      )
      if (current !== serial || signal.aborted || !actor.current(epoch)) return
      if (
        !Array.isArray(result.data) ||
        !result.data.every((value) => typeof value === 'string') ||
        !Number.isSafeInteger(result.total)
      )
        throw new Error('Invalid value options')
      values.value = append ? [...new Set([...values.value, ...result.data])] : result.data
      total.value = result.total
      page = next
    } catch (cause) {
      if (current === serial && !signal.aborted && actor.current(epoch))
        error.value = cause instanceof Error ? cause.message : 'Unavailable'
    } finally {
      if (current === serial) loading.value = false
    }
  }
  watch(
    () => actor.denied.value,
    (denied) => {
      if (denied) clear()
    },
  )
  onScopeDispose(clear)
  return { values, total, loading, error, load, more: () => load(keyword, true) }
}
