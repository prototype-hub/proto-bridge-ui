import { ref, onMounted, watch } from 'vue'
import { projectsApi } from '@/modules/protohub-manager-ui/api'
import { createCreationIntent } from '@/modules/protohub-manager-ui/utils/creation-intent'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { saved, deleted } from '@/shared/utils/feedback'
import type { ProjectInput, Project, ProjectUsage } from '@/modules/protohub-manager-ui/types'
export function useProjects() {
  const resource = useResource((signal) => projectsApi.list({ signal, silent: true }), [])
  const usage = useResource<ProjectUsage | undefined>(
    (signal) => projectsApi.usage({ signal, silent: true }),
    undefined,
  )
  const intent = createCreationIntent()
  const task = useTask()
  const open = ref(false)
  const editId = ref('')
  const form = ref<ProjectInput>({ name: '', description: '' })
  const search = ref('')
  function loadUsage() {
    usage.data.value = undefined
    return usage.load()
  }
  async function refresh() {
    await Promise.all([resource.load(), loadUsage()])
  }
  function edit(project?: Project) {
    intent.reset()
    task.error.value = ''
    editId.value = project?.id || ''
    form.value = { name: project?.name || '', description: project?.description || '' }
    open.value = true
  }
  async function save(draft: ProjectInput = form.value) {
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
    await task.run(async () => {
      await projectsApi.remove(id)
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
    search,
    edit,
    save,
    remove,
  }
}
