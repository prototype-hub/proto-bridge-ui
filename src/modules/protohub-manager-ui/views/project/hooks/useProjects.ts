import { ref, onMounted } from 'vue'
import { projectsApi } from '@/modules/protohub-manager-ui/api'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { saved, deleted } from '@/shared/utils/feedback'
import type { ProjectInput, Project } from '@/modules/protohub-manager-ui/types'
export function useProjects() {
  const resource = useResource((signal) => projectsApi.list({ signal, silent: true }), [])
  const task = useTask()
  const open = ref(false)
  const editId = ref('')
  const form = ref<ProjectInput>({ name: '', description: '' })
  const search = ref('')
  function edit(project?: Project) {
    editId.value = project?.id || ''
    form.value = { name: project?.name || '', description: project?.description || '' }
    open.value = true
  }
  async function save(draft: ProjectInput = form.value) {
    await task.run(async () => {
      const input = { ...draft, name: draft.name.trim() }
      await (editId.value ? projectsApi.update(editId.value, input) : projectsApi.create(input))
      saved()
      open.value = false
      await resource.load()
    })
  }
  async function remove(id: string) {
    await task.run(async () => {
      await projectsApi.remove(id)
      deleted()
      await resource.load()
    })
  }
  onMounted(resource.load)
  return { resource, task, open, editId, form, search, edit, save, remove }
}
