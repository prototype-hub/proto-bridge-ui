import { ref, onMounted, watch } from 'vue'
import { projectsApi } from '@/modules/protohub-manager-ui/api'
import { createCreationIntent } from '@/modules/protohub-manager-ui/utils/creation-intent'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { saved, deleted } from '@/shared/utils/feedback'
import { ApiError } from '@/shared/api/errors'
import type { ProjectInput, Project, ProjectUsage } from '@/modules/protohub-manager-ui/types'
import { usePrototypeList } from './usePrototypeList'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
export function useProjects() {
  const list = usePrototypeList<Project>(projectsApi.query, () => {
    if (editId.value) {
      open.value = false
      editId.value = ''
    }
  })
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
    await task.run(async () => {
      const input = { ...draft, name: draft.name.trim(), description: draft.description?.trim() }
      await (editId.value
        ? projectsApi.update(editId.value, input)
        : projectsApi.create(input, {
            headers: {
              'Idempotency-Key': intent.key([input.name, input.description, input.cover]),
            },
          }))
      saved()
      open.value = false
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
    await task.run(async () => {
      try {
        await projectsApi.remove(id)
      } catch (cause) {
        // Another operator may have deleted the row; reload without treating a denial as success.
        if (cause instanceof ApiError && cause.status === 404) await refresh()
        throw cause
      }
      deleted()
      await refresh()
    })
  }
  watch(
    open,
    (value) => {
      if (!value) intent.reset()
    },
    { flush: 'sync' },
  )
  onMounted(refresh)
  return {
    resource,
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
