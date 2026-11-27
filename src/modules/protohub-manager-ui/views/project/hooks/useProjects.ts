import { ref, reactive, onMounted, onScopeDispose, watch, type Ref } from 'vue'
import { projectsApi } from '@/modules/protohub-manager-ui/api'
import { createCreationIntent } from '@/modules/protohub-manager-ui/utils/creation-intent'
import { useResource } from '@/shared/composables/useResource'
import { useTask } from '@/shared/composables/useTask'
import { saved, deleted } from '@/shared/utils/feedback'
import { ApiError } from '@/shared/api/errors'
import type {
  ProjectInput,
  Project,
  ProjectUsage,
  ProjectListQuery,
} from '@/modules/protohub-manager-ui/types'
import { useProjectActor } from './useProjectActor'
import { usePrototypeList } from './usePrototypeList'
import { usePermissions } from '@/shared/auth/provider'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
export function useProjects(
  trash: Ref<boolean> = ref(false),
  canReload: () => boolean = () => true,
) {
  const restoredProject = ref<Project>()
  const permissions = usePermissions()
  let generation = 0
  const filters = reactive<
    Pick<ProjectListQuery, 'archived' | 'groupName' | 'tag' | 'favoriteOnly'>
  >({ archived: false, groupName: undefined, tag: undefined, favoriteOnly: false })
  const list = usePrototypeList<Project>(
    async (query, options) => {
      const epoch = actor.requirePermission(p.project.query)
      const result = await (trash.value
        ? projectsApi.deleted(query, options)
        : projectsApi.query({ ...query, ...filters }, options))
      if (!actor.current(epoch)) throw new ApiError('Project access unavailable', 403)
      return result
    },
    () => {
      if (editId.value) {
        open.value = false
        editId.value = ''
      }
    },
    canReload,
  )
  const { resource } = list
  const usage = useResource<ProjectUsage | undefined>(async (signal) => {
    const epoch = actor.requirePermission(p.project.query)
    const result = await projectsApi.usage({ signal, silent: true })
    if (!actor.current(epoch)) throw new ApiError('Project access unavailable', 403)
    return result
  }, undefined)
  const intent = createCreationIntent()
  const task = useTask()
  const open = ref(false)
  const editId = ref('')
  const form = ref<ProjectInput>({ name: '', description: '' })
  const actor = useProjectActor(() => {
    generation++
    open.value = false
    form.value = { name: '', description: '' }
    list.resetScope()
    usage.data.value = undefined
    resetFilters()
  })
  function resetFilters() {
    Object.assign(filters, {
      archived: false,
      groupName: undefined,
      tag: undefined,
      favoriteOnly: false,
    })
  }
  async function resetSearch() {
    if (!canReload()) return
    resetFilters()
    await list.reset()
  }
  async function filter(patch: Partial<typeof filters>) {
    if (!canReload()) return
    Object.assign(filters, patch)
    await list.search()
  }
  function loadUsage() {
    usage.data.value = undefined
    return usage.load()
  }
  async function refresh() {
    if (!canReload()) return
    await Promise.all([resource.load(), loadUsage()])
  }
  function edit(project?: Project) {
    if (trash.value || !actor.current()) return
    generation++
    if (project && !projectAllows(project, 'edit')) return
    intent.reset()
    task.error.value = ''
    editId.value = project?.id || ''
    form.value = {
      name: project?.name || '',
      description: project?.description || '',
      cover: project?.cover || '',
    }
    open.value = true
  }
  async function save(draft: ProjectInput = form.value) {
    if (!actor.current()) return
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
        const input = {
          ...draft,
          ...(editId.value && draft.cover === undefined && form.value.cover
            ? { cover: form.value.cover }
            : {}),
          name: draft.name.trim(),
          description: draft.description?.trim(),
        }
        await (editId.value
          ? projectsApi.update(editId.value, input)
          : projectsApi.create(input, {
              headers: {
                'Idempotency-Key': intent.key([input.name, input.description, input.cover]),
              },
            }))
        if (submitted !== generation || !actor.current()) return
        saved()
        open.value = false
        await refresh()
      } catch (cause) {
        if (submitted === generation && actor.current()) throw cause
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
      restoredProject.value = project
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
      restoredProject.value = undefined
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
    restoredProject,
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
    resetSearch,
    filters,
    filter,
    sort: list.sort,
    changeSort: list.changeSort,
    pagination: list.pagination,
    page: list.page,
    edit,
    save,
    remove,
  }
}
