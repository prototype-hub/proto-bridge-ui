import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useSession } from '@/app/stores/session'
import { ApiError } from '@/shared/api/errors'
import { download } from '@/shared/api/client'
import { diagnosticsApi } from '../../../api/diagnostics'
import { protoPermissions } from '../../../routes/permissions'
import type { DiagnosticSnapshot } from '../../../types/diagnostics'

/** Keep the last same-session snapshot on transient errors, never after an identity or permission change. */
export function useDiagnostics() {
  const session = useSession()
  const data = shallowRef<DiagnosticSnapshot>()
  const loading = ref(false)
  const denied = ref(false)
  const failed = ref(false)
  const exportFailed = ref(false)
  const schemaInvalid = ref(false)
  const now = ref(Date.now())
  const canQuery = computed(() => session.can(protoPermissions.diagnostics.query))
  const stale = computed(
    () => !!data.value && (failed.value || now.value - data.value.collectedAt > 300_000),
  )
  let generation = 0
  let controller: AbortController | undefined
  const clock = setInterval(() => (now.value = Date.now()), 30_000)

  async function load() {
    if (!canQuery.value) return
    controller?.abort()
    const current = new AbortController()
    const epoch = generation
    controller = current
    loading.value = true
    failed.value = false
    exportFailed.value = false
    try {
      const snapshot = await diagnosticsApi.get({ signal: current.signal, silent: true })
      if (current.signal.aborted || epoch !== generation) return
      data.value = snapshot
      now.value = Date.now()
      denied.value = false
      schemaInvalid.value = false
    } catch (error) {
      if (current.signal.aborted || epoch !== generation) return
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        data.value = undefined
        denied.value = true
      } else {
        failed.value = true
        schemaInvalid.value ||=
          error instanceof Error && error.message === 'DIAGNOSTIC_SCHEMA_INVALID'
      }
    } finally {
      if (controller === current) loading.value = false
    }
  }

  async function exportSnapshot() {
    if (!data.value || !canQuery.value || denied.value || loading.value || schemaInvalid.value)
      return
    const snapshot = data.value
    exportFailed.value = false
    try {
      await download({
        blob: new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
        filename: `prototype-hub-diagnostics-${snapshot.collectedAt}.json`,
        contentType: 'application/json',
      })
    } catch {
      exportFailed.value = true
    }
  }

  watch(
    [
      () => session.user?.id,
      () => session.user?.status,
      () => JSON.stringify(session.user?.roleList?.map((role) => role.id).sort() ?? null),
      () => [...session.permissions].sort().join(','),
    ],
    () => {
      ++generation
      controller?.abort()
      data.value = undefined
      loading.value = denied.value = failed.value = exportFailed.value = schemaInvalid.value = false
      if (canQuery.value) void load()
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    ++generation
    controller?.abort()
    clearInterval(clock)
    data.value = undefined
  })
  return {
    data,
    loading,
    denied,
    failed,
    exportFailed,
    schemaInvalid,
    canQuery,
    stale,
    load,
    exportSnapshot,
  }
}
