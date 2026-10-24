import { secureId } from '@/shared/utils/secure-id'
import { onScopeDispose, ref } from 'vue'
import { useRouter } from 'vue-router'
import { relatedSaveMessage } from '@/modules/authentication-manager-ui/utils/related-record'
import { t } from '@/shared/i18n'
export function useRelatedRecord(
  refresh: () => Promise<void>,
  selected: (kind: string, id: string) => void,
  activeSession: () => unknown,
) {
  const router = useRouter()
  const relatedError = ref('')
  let applying = false,
    disposed = false
  const popups = new Map<
    string,
    { tab: Window; kind: string; session: unknown; savedId?: string }
  >()
  async function retryRelated() {
    if (applying || disposed) return
    applying = true
    relatedError.value = ''
    try {
      for (const [sourceId, popup] of popups) {
        if (activeSession() !== popup.session) {
          popups.delete(sourceId)
          continue
        }
        if (!popup.savedId) continue
        await refresh()
        if (!disposed && activeSession() === popup.session) selected(popup.kind, popup.savedId)
        popups.delete(sourceId)
      }
    } catch (cause) {
      relatedError.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      applying = false
    }
  }
  function receive(event: MessageEvent<unknown>) {
    if (event.origin !== window.location.origin || !relatedSaveMessage(event.data)) return
    const popup = popups.get(event.data.sourceId)
    if (!popup || event.source !== popup.tab) return
    popup.savedId = event.data.id
    void retryRelated()
  }
  function focus() {
    void retryRelated()
  }
  window.addEventListener('focus', focus)
  window.addEventListener('message', receive)
  onScopeDispose(() => {
    disposed = true
    window.removeEventListener('focus', focus)
    window.removeEventListener('message', receive)
    popups.clear()
  })
  function open(kind: 'role' | 'org' | 'position') {
    const session = activeSession()
    if (session === undefined) return
    relatedError.value = ''
    const sourceId = `related_${secureId()}`
    const path = { role: '/system/Role', org: '/system/Department', position: '/system/Positions' }[
      kind
    ]
    const tab = window.open(router.resolve({ path, query: { save: 'true', sourceId } }).href)
    if (!tab) return
    popups.set(sourceId, { tab, kind, session })
  }
  return { openRelated: open, relatedError, retryRelated }
}
