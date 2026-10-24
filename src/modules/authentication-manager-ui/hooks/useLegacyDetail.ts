import { onScopeDispose, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { t } from '@/shared/i18n'

/** Read each latest route immediately; stale reads cannot commit into a newer detail. */
export function useLegacyDetail(
  load: (id: string, path: string, current: () => boolean) => Promise<void>,
  create?: () => Promise<void>,
) {
  const route = useRoute()
  const busy = ref(false)
  const error = ref('')
  let generation = 0
  watch(
    () => route.fullPath,
    async () => {
      const currentGeneration = ++generation
      const current = () => currentGeneration === generation
      const id = String(route.params.id || route.query.id || '')
      const path = route.path
      busy.value = true
      error.value = ''
      try {
        if (id) await load(id, path, current)
        else if (path.endsWith('/Save')) await create?.()
      } catch (cause) {
        if (current()) error.value = cause instanceof Error ? cause.message : t('common.unknown')
      } finally {
        if (current()) busy.value = false
      }
    },
    { immediate: true },
  )
  onScopeDispose(() => generation++)
  return { busy, error }
}
