import { onScopeDispose, ref, watch } from 'vue'
import { useSession } from '@/app/stores/session'
import { usePermissions } from '@/shared/auth/provider'
import { token } from '@/shared/auth/token'
import { ApiError } from '@/shared/api/errors'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'

/** Project preferences and drafts cannot outlive the exact signed-in credential. */
export function useProjectActor(clear: () => void) {
  const session = useSession()
  const permissions = usePermissions()
  const denied = ref(false)
  let actor = session.user?.id,
    credential = token.get(),
    generation = 0
  function invalidate() {
    if (!denied.value) {
      generation++
      denied.value = true
      clear()
    }
  }
  function current(epoch = generation) {
    if (epoch !== generation) return false
    if (
      !actor ||
      session.user?.id !== actor ||
      !credential ||
      token.get() !== credential ||
      [0, -1, 'disabled'].includes(session.user?.status ?? 1)
    ) {
      invalidate()
      return false
    }
    return !denied.value
  }
  function requirePermission(permission: string) {
    if (!current() || !permissions.can(permission)) {
      invalidate()
      throw new ApiError('Project access unavailable', 403)
    }
    return generation
  }
  const check = () => {
    current()
  }
  window.addEventListener('focus', check)
  window.addEventListener('storage', check)
  watch(
    () => session.user?.id,
    (value) => {
      generation++
      clear()
      actor = value
      credential = token.get()
      denied.value = false
    },
    { flush: 'sync' },
  )
  watch(
    () => [session.user?.status, permissions.can(p.project.query), permissions.can(p.project.save)],
    () => {
      generation++
      clear()
    },
    { flush: 'sync' },
  )
  onScopeDispose(() => {
    window.removeEventListener('focus', check)
    window.removeEventListener('storage', check)
    generation++
  })
  return { denied, current, requirePermission }
}
