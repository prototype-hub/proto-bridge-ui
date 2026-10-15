import { ref, shallowRef, onScopeDispose } from 'vue'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
export function useResource<T>(fetcher: (signal: AbortSignal) => Promise<T>, initial: T) {
  const data = shallowRef<T>(initial)
  const loading = ref(false)
  const error = ref('')
  let controller: AbortController | undefined
  async function load() {
    controller?.abort()
    const current = new AbortController()
    controller = current
    loading.value = true
    error.value = ''
    try {
      const result = await fetcher(current.signal)
      if (!current.signal.aborted) data.value = result
    } catch (cause) {
      if (!current.signal.aborted && !(cause instanceof ApiError && cause.cancelled))
        error.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (controller === current) loading.value = false
    }
  }
  onScopeDispose(() => controller?.abort())
  return { data, loading, error, load }
}
