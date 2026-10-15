import { ref } from 'vue'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
export function useTask() {
  const busy = ref(false)
  const error = ref('')
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return undefined
    busy.value = true
    error.value = ''
    try {
      return await action()
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.cancelled))
        error.value = cause instanceof Error ? cause.message : t('common.unknown')
      return undefined
    } finally {
      busy.value = false
    }
  }
  return { busy, error, run }
}
