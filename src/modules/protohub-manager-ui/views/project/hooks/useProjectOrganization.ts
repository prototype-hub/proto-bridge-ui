import { computed, onScopeDispose, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import { projectsApi } from '@/modules/protohub-manager-ui/api'
import type {
  Project,
  ProjectFavoriteInput,
  ProjectOrganizationDraft,
  ProjectOrganizationInput,
} from '@/modules/protohub-manager-ui/types'
import {
  normalizeOrganization,
  validOrganization,
} from '@/modules/protohub-manager-ui/utils/project-organization'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { usePermissions } from '@/shared/auth/provider'
import { secureId } from '@/shared/utils/secure-id'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import { useProjectActor } from './useProjectActor'

type Operation =
  | { kind: 'organization'; id: string; input: ProjectOrganizationInput }
  | { kind: 'favorite'; id: string; input: ProjectFavoriteInput }
const draftOf = (project: Project): ProjectOrganizationDraft => ({
  groupName: project.groupName || '',
  tags: [...(project.tags || [])],
  archived: project.archivedTime != null,
})

export function useProjectOrganization(
  project: Ref<Project>,
  updated: (value: Project, kind: Operation['kind']) => void,
) {
  const permissions = usePermissions()
  const open = ref(false),
    busy = ref(false),
    unknown = ref(false),
    conflict = ref(false)
  const error = ref(''),
    notice = ref('')
  const form = reactive<ProjectOrganizationDraft>({ groupName: '', tags: [], archived: false })
  const original = shallowRef<Project>()
  let generation = 0,
    request: AbortController | undefined,
    pending: Operation | undefined
  function clear() {
    generation++
    request?.abort()
    pending = undefined
    open.value = busy.value = unknown.value = conflict.value = false
    error.value = notice.value = ''
    original.value = undefined
    Object.assign(form, { groupName: '', tags: [], archived: false })
  }
  const actor = useProjectActor(clear)
  const canFavorite = computed(
    () =>
      !actor.denied.value &&
      permissions.can(p.project.query) &&
      projectAllows(project.value, 'read'),
  )
  const canEdit = computed(
    () =>
      !actor.denied.value &&
      permissions.can(p.project.save) &&
      projectAllows(project.value, 'edit'),
  )
  const locked = computed(() => busy.value || unknown.value)
  const dirty = computed(
    () =>
      open.value &&
      !!original.value &&
      JSON.stringify(normalizeOrganization(form)) !==
        JSON.stringify(normalizeOrganization(draftOf(original.value))),
  )
  function edit() {
    if (!actor.current() || !canEdit.value || locked.value) return
    original.value = project.value
    Object.assign(form, draftOf(project.value))
    error.value = notice.value = ''
    conflict.value = false
    open.value = true
  }
  function validResponse(value: Project, id: string) {
    if (
      value.id !== id ||
      typeof value.favorite !== 'boolean' ||
      typeof value.groupName !== 'string' ||
      !Array.isArray(value.tags) ||
      !value.tags.every((tag) => typeof tag === 'string') ||
      ![value.organizationVersion, value.favoriteVersion].every(
        (version) => Number.isSafeInteger(version) && version >= 0,
      ) ||
      !(value.archivedTime === null || Number.isSafeInteger(value.archivedTime))
    )
      throw new Error('Invalid project response')
  }
  async function execute(operation: Operation) {
    const permission = operation.kind === 'favorite' ? p.project.query : p.project.save
    if (
      busy.value ||
      !actor.current() ||
      !(operation.kind === 'favorite' ? canFavorite.value : canEdit.value) ||
      project.value.id !== operation.id
    )
      return
    const epoch = generation,
      actorEpoch = actor.requirePermission(permission)
    request?.abort()
    const active = (request = new AbortController())
    pending = operation
    busy.value = true
    error.value = notice.value = ''
    try {
      const options = { signal: active.signal, silent: true }
      const value =
        operation.kind === 'favorite'
          ? await projectsApi.favorite(operation.id, operation.input, options)
          : await projectsApi.organization(operation.id, operation.input, options)
      if (epoch !== generation || active.signal.aborted || !actor.current(actorEpoch)) return
      validResponse(value, operation.id)
      pending = undefined
      unknown.value = conflict.value = false
      original.value = value
      if (operation.kind === 'organization') {
        Object.assign(form, draftOf(value))
        open.value = false
      }
      notice.value = t('proto.organizationSaved')
      updated(value, operation.kind)
    } catch (cause) {
      if (epoch !== generation || active.signal.aborted || !actor.current(actorEpoch)) return
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
        clear()
        actor.denied.value = true
        error.value = t('proto.organizationUnavailable')
      } else if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        pending = undefined
        unknown.value = false
        conflict.value = cause.status === 409
        error.value = t(
          conflict.value ? 'proto.organizationConflict' : 'proto.organizationRejected',
        )
      } else {
        unknown.value = true
        error.value = t('proto.organizationUnknown')
      }
    } finally {
      if (epoch === generation && actor.current(actorEpoch)) busy.value = false
    }
  }
  function save() {
    if (!canEdit.value || !actor.current() || locked.value || conflict.value || !original.value)
      return
    if (!validOrganization(form)) {
      error.value = t('proto.organizationInvalid')
      return
    }
    const value = normalizeOrganization(form)
    const input = Object.freeze({
      ...value,
      tags: Object.freeze([...value.tags]) as unknown as string[],
      expectedVersion: original.value.organizationVersion,
      clientRequestId: secureId(),
    })
    return execute({ kind: 'organization', id: project.value.id, input })
  }
  function favorite() {
    if (!canFavorite.value || !actor.current() || locked.value || conflict.value) return
    return execute({
      kind: 'favorite',
      id: project.value.id,
      input: Object.freeze({
        favorite: !project.value.favorite,
        expectedVersion: project.value.favoriteVersion,
        clientRequestId: secureId(),
      }),
    })
  }
  function archive() {
    if (!canEdit.value || !actor.current() || locked.value || conflict.value) return
    const value = normalizeOrganization(draftOf(project.value))
    return execute({
      kind: 'organization',
      id: project.value.id,
      input: Object.freeze({
        ...value,
        tags: Object.freeze([...value.tags]) as unknown as string[],
        archived: !value.archived,
        expectedVersion: project.value.organizationVersion,
        clientRequestId: secureId(),
      }),
    })
  }
  function retry() {
    if (unknown.value && pending && !busy.value) return execute(pending)
  }
  async function refreshVersion() {
    if (busy.value || !actor.current() || !permissions.can(p.project.query)) return
    const epoch = generation,
      actorEpoch = actor.requirePermission(p.project.query)
    busy.value = true
    try {
      const value = await projectsApi.get(project.value.id, { silent: true })
      if (epoch !== generation || !actor.current(actorEpoch)) return
      validResponse(value, project.value.id)
      original.value = value
      if (open.value) form.archived = value.archivedTime != null
      pending = undefined
      unknown.value = conflict.value = false
      error.value = ''
      notice.value = t('proto.organizationRefreshed')
      // Keep the user's shared draft while adopting the current CAS version.
      if (!open.value) updated(value, 'organization')
    } catch (cause) {
      if (epoch !== generation || !actor.current(actorEpoch)) return
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
        clear()
        actor.denied.value = true
        error.value = t('proto.organizationUnavailable')
      } else
        error.value = cause instanceof Error ? cause.message : t('proto.organizationUnavailable')
    } finally {
      if (epoch === generation && actor.current(actorEpoch)) busy.value = false
    }
  }
  watch(
    () => [
      project.value.id,
      permissions.can(p.project.query),
      permissions.can(p.project.save),
      projectAllows(project.value, 'read'),
      projectAllows(project.value, 'edit'),
    ],
    clear,
    { flush: 'sync' },
  )
  onScopeDispose(clear)
  return {
    open,
    busy,
    unknown,
    conflict,
    error,
    notice,
    form,
    canFavorite,
    canEdit,
    locked,
    dirty,
    edit,
    save,
    favorite,
    archive,
    retry,
    refreshVersion,
    clear,
  }
}
