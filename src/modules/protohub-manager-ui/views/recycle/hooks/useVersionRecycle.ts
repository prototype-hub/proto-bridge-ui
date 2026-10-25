import { onScopeDispose, watch, type Ref } from 'vue'
import { versionsApi } from '@/modules/protohub-manager-ui/api'
import type { Version } from '@/modules/protohub-manager-ui/types'
import { usePrototypeList } from '@/modules/protohub-manager-ui/views/project/hooks/usePrototypeList'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { usePermissions } from '@/shared/auth/provider'
import { useTask } from '@/shared/composables/useTask'
import { ApiError } from '@/shared/api/errors'
import { saved } from '@/shared/utils/feedback'
import { t } from '@/shared/i18n'

/** null rejects an invalid route filter; undefined means all server-authorized editable projects. */
export function useVersionRecycle(projectId: Ref<string | undefined | null>, active: Ref<boolean>) {
  const permissions = usePermissions()
  const task = useTask()
  let generation = 0
  const list = usePrototypeList<Version>(async (query, options) => {
    if (!active.value || !permissions.can(p.version.query))
      return { data: [], total: 0, pageIndex: 0, pageSize: query.pageSize || 20 }
    const scope = projectId.value
    if (scope === null) throw new Error(t('proto.recycleFilterInvalid'))
    const result = await versionsApi.deleted(scope, query, options)
    if (options.signal?.aborted) return { ...result, data: [] }
    if (
      result.data.some(
        (row) =>
          !row.id || !row.projectId || !row.deletedTime || (scope && row.projectId !== scope),
      )
    )
      throw new Error(t('proto.projectUnavailable'))
    return result
  })

  async function restore(version: Version) {
    if (
      !active.value ||
      !permissions.can(p.version.query) ||
      !permissions.can(p.version.save) ||
      !list.resource.data.value.some(
        (row) => row.id === version.id && row.projectId === version.projectId,
      )
    )
      return
    const submitted = generation
    await task.run(async () => {
      try {
        // The server rechecks active parent, EDIT scope, retention and capacity at commit time.
        await versionsApi.restore(version.id, { silent: true })
      } catch (cause) {
        if (submitted !== generation) return
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403))
          await list.resource.load()
        if (submitted !== generation) return
        throw cause
      }
      if (submitted !== generation) return
      saved()
      await list.resource.load()
    })
  }
  watch(
    () => [projectId.value, active.value, permissions.can(p.version.query)],
    () => {
      generation++
      task.error.value = ''
      list.resetScope()
      // Loading the inactive scope aborts the previous request without making another API call.
      void list.resource.load()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => generation++)
  return { ...list, task, restore }
}
