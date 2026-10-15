import { computed, onScopeDispose, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  queryHistory,
  removeQueryHistory,
  saveQueryHistory,
  type QueryHistoryRecord,
} from '@/shared/api/query-history'
import { useResource } from './useResource'
import { useTask } from './useTask'

const historyTargets: Record<string, string> = {
  'system/User': 'system-user',
  'system/Role': 'system-role',
  'system/Permission': 'system-permission',
  'system/Positions': 'system-position',
  'system/Log/System': 'search-system',
  'Log/System': 'search-system',
  'system/Log/Access': 'search-access',
  'Log/Access': 'search-access',
}

/** Own settings requests and ignore work from an earlier target or an unmounted search. */
export function useQueryHistory(explicitTarget: () => string) {
  const route = useRoute(),
    task = useTask()
  const target = computed(
    () =>
      explicitTarget() ||
      historyTargets[String(route.meta.menuCode)] ||
      `search-${route.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
  )
  let generation = 0
  const resource = useResource(
    (signal) => queryHistory(target.value, { signal, silent: true }),
    [] as QueryHistoryRecord[],
  )
  watch(
    target,
    () => {
      generation++
      resource.data.value = []
      task.error.value = ''
      void resource.load()
    },
    { immediate: true },
  )
  onScopeDispose(() => generation++)

  async function run(command: (bucket: string) => Promise<unknown>): Promise<boolean> {
    if (task.busy.value) return false
    const current = generation,
      bucket = target.value
    let completed = false
    await task.run(async () => {
      try {
        await command(bucket)
        if (generation !== current) return
        completed = true
        await resource.load()
      } catch (cause) {
        if (generation === current) throw cause
      }
    })
    return completed && generation === current
  }
  return {
    target,
    rows: resource.data,
    loading: resource.loading,
    error: resource.error,
    actionError: task.error,
    busy: task.busy,
    load: resource.load,
    save: (name: string, content: string) =>
      run((bucket) => saveQueryHistory(bucket, name, content)),
    remove: (id: string) => run((bucket) => removeQueryHistory(bucket, id)),
  }
}
