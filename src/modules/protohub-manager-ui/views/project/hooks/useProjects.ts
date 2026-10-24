import { ref, onMounted, onScopeDispose, watch } from 'vue'
import { projectsApi } from '@/modules/protohub-manager-ui/api'
import { createCreationIntent } from '@/modules/protohub-manager-ui/utils/creation-intent'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { saved, deleted } from '@/shared/utils/feedback'
import { ApiError } from '@/shared/api/errors'
import type { ProjectInput, Project, ProjectUsage } from '@/modules/protohub-manager-ui/types'
import { usePrototypeList } from './usePrototypeList'
import { usePermissions } from '@/shared/auth/provider'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
export function useProjects() {
  const trash = ref(false)
  const permissions = usePermissions()
  let generation = 0
  const list = usePrototypeList<Project>(
    (query, options) => (trash.value ? projectsApi.deleted : projectsApi.query)(query, options),
    () => {
      if (editId.value) {
        open.value = false
        editId.value = ''
      }
    },
  )
  const { resource } = list
  const usage = useResource<ProjectUsage | undefined>(
    (signal) => projectsApi.usage({ signal, silent: true }),
    undefined,
  )
  const intent = createCreationIntent()
  const task = useTask()
  const open = ref(false)
  const editId = ref('')
  const form = ref<ProjectInput>({ name: '', description: '' })
  function loadUsage() {
    usage.data.value = undefined
    return usage.load()
  }
  async function refresh() {
    await Promise.all([resource.load(), loadUsage()])
  }
  function edit(project?: Project) {
    if (trash.value) return
    generation++
    if (project && !projectAllows(project, 'edit')) return
    intent.reset()
    task.error.value = ''
    editId.value = project?.id || ''
    form.value = { name: project?.name || '', description: project?.description || '' }
    open.value = true
  }
  async function save(draft: ProjectInput = form.value) {
    if (
      editId.value &&
      !projectAllows(
        resource.data.value.find((project) => project.id === editId.value),
        'edit',
      )
    )
      return
    const submitted = generation
    await task.run(async () => {
      try {
        const input = { ...draft, name: draft.name.trim(), description: draft.description?.trim() }
        await (editId.value
          ? projectsApi.update(editId.value, input)
          : projectsApi.create(input, {
              headers: {
                'Idempotency-Key': intent.key([input.name, input.description, input.cover]),
              },
            }))
        if (submitted !== generation) return
        saved()
        open.value = false
        await refresh()
      } catch (cause) {
        if (submitted === generation) throw cause
      }
    })
  }
  async function restore(project: Project) {
    if (
      !trash.value ||
      !permissions.can(p.project.save) ||
      !projectAllows(project, 'deleteProject')
    )
      return
    const submitted = generation
    await task.run(async () => {
      try {
        await projectsApi.restore(project.id)
      } catch (cause) {
        if (submitted !== generation) return
        if (cause instanceof ApiError && cause.status === 404) await refresh()
        throw cause
      }
      if (submitted !== generation) return
      saved()
      await refresh()
    })
  }
  async function remove(id: string) {
    if (
      !projectAllows(
        resource.data.value.find((project) => project.id === id),
        'deleteProject',
      )
    )
      return
    const submitted = generation
    await task.run(async () => {
      try {
        await projectsApi.remove(id)
      } catch (cause) {
        if (submitted !== generation) return
        // Another operator may have deleted the row; reload without treating a denial as success.
        if (cause instanceof ApiError && cause.status === 404) await refresh()
        throw cause
      }
      if (submitted !== generation) return
      deleted()
      await refresh()
    })
  }
  // Changing the list or closing an editor invalidates its pending mutation callbacks.
  watch(
    trash,
    () => {
      generation++
      open.value = false
      task.error.value = ''
      list.resetScope()
      void refresh()
    },
    { flush: 'sync' },
  )
  onScopeDispose(() => generation++)
  watch(
    open,
    (value) => {
      if (!value) {
        generation++
        intent.reset()
      }
    },
    { flush: 'sync' },
  )
  onMounted(refresh)
  return {
    resource,
    trash,
    restore,
    usage,
    loadUsage,
    refresh,
    task,
    open,
    editId,
    form,
    search: list.keyword,
    submitSearch: list.search,
    resetSearch: list.reset,
    sort: list.sort,
    changeSort: list.changeSort,
    pagination: list.pagination,
    page: list.page,
    edit,
    save,
    remove,
  }
}
