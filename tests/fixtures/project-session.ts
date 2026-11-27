import { createPinia } from 'pinia'
import { useSession } from '../../src/app/stores/session'
import { token } from '../../src/shared/auth/token'

/** Project composables require an actual actor and credential, as their routed pages do. */
export function projectTestPinia() {
  const pinia = createPinia()
  token.set('project-test-credential')
  useSession(pinia).user = { id: 'u1', username: 'admin', name: 'Admin', status: 1 }
  return pinia
}
