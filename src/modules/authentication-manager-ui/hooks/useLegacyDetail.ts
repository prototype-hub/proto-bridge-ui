import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTask } from '@/shared/composables/useTask'
export function useLegacyDetail(
  load: (id: string, path: string) => Promise<void>,
  create?: () => Promise<void>,
) {
  const route = useRoute(),
    task = useTask()
  watch(
    () => route.fullPath,
    () =>
      void task.run(async () => {
        const id = String(route.params.id || route.query.id || '')
        if (id) await load(id, route.path)
        else if (route.path.endsWith('/Save')) await create?.()
      }),
    { immediate: true },
  )
  return task
}
