import { computed, onScopeDispose, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import { ApiError, isRecord } from '@/shared/api/errors'
import { usePermissions } from '@/shared/auth/provider'
import { token } from '@/shared/auth/token'
import { secureId } from '@/shared/utils/secure-id'
import { t } from '@/shared/i18n'
import { protoPermissions as p } from '../routes/permissions'
import { projectAllows } from '../utils/project-access'
import {
  flattenPages,
  previewIdentity,
  selectablePage,
  stablePageId,
} from '../utils/preview-location'
import { blankDemoScript, demoText, validDemoScript } from '../utils/demo-script'
import { demoScriptApi as api } from '../api/demo-script'
import type {
  DemoScript,
  DemoScriptDraft,
  DemoScriptInput,
  DemoScriptScope,
  DemoScriptSummary,
  PublicDemoScript,
  PublicDemoScriptSummary,
} from '../types/demo-script'

type Operation =
  | { kind: 'create'; input: DemoScriptInput }
  | { kind: 'update'; id: string; input: DemoScriptInput & { expectedVersion: number } }
  | { kind: 'delete'; id: string; input: { clientRequestId: string; expectedVersion: number } }
const summaryKeys = [
  'id',
  'projectId',
  'versionId',
  'revisionId',
  'title',
  'shareEnabled',
  'configVersion',
  'createdAt',
  'updatedAt',
]
const publicKeys = ['id', 'revisionId', 'title']
const bodyKeys = ['objective', 'prerequisites', 'resetNote', 'steps']
function exact(value: unknown, keys: string[]) {
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  )
}
function copyDraft(value: DemoScriptDraft): DemoScriptDraft {
  return {
    title: value.title,
    objective: value.objective,
    prerequisites: value.prerequisites,
    resetNote: value.resetNote,
    shareEnabled: value.shareEnabled,
    steps: value.steps.map(({ id, pageId, narration }) => ({ id, pageId, narration })),
  }
}

/** Drafts and original write receipts live only inside the authorized immutable scope. */
export function useDemoScripts(scope: Ref<DemoScriptScope | undefined>) {
  const permissions = usePermissions()
  const authorized = computed(() => {
    const value = scope.value
    if (!value?.context.revisionId) return undefined
    if (value.kind === 'public')
      return value.share.accessKey &&
        value.share.revisionId === value.context.revisionId &&
        value.share.runtimeBaseUrl === value.context.runtimeBaseUrl
        ? value
        : undefined
    return value.actorId &&
      value.project.id === value.revision.projectId &&
      value.context.revisionId === value.revision.id &&
      projectAllows(value.project, 'read') &&
      permissions.can(p.version.query)
      ? value
      : undefined
  })
  const denied = ref(false)
  const isPublic = computed(() => scope.value?.kind === 'public')
  const canEdit = computed(() => {
    const value = authorized.value
    return (
      value?.kind === 'member' &&
      !denied.value &&
      projectAllows(value.project, 'edit') &&
      permissions.can(p.version.save)
    )
  })
  const pages = computed(() => {
    const value = authorized.value
    return value
      ? flattenPages(value.context.pages).flatMap((page) => {
          const pageId = stablePageId(page, value.context.pages)
          return pageId &&
            pageId.length <= 128 &&
            selectablePage(page, value.context.runtimeBaseUrl)
            ? [{ pageId, name: page.name, path: page.path! }]
            : []
        })
      : []
  })
  const pageIds = computed(() => new Set(pages.value.map((page) => page.pageId)))
  const form = reactive<DemoScriptDraft>(blankDemoScript())
  const baseline = ref(JSON.stringify(form))
  const original = shallowRef<DemoScript | PublicDemoScript>()
  const rows = shallowRef<(DemoScriptSummary | PublicDemoScriptSummary)[]>([])
  const pageIndex = ref(0),
    total = ref(0),
    activeStepId = ref('')
  const mode = ref<'list' | 'edit' | 'rehearse'>('list')
  const loading = ref(false),
    busy = ref(false),
    unknown = ref(false),
    conflict = ref(false)
  const error = ref(''),
    notice = ref(''),
    invalid = ref(false)
  const dirty = computed(
    () => canEdit.value && mode.value !== 'list' && JSON.stringify(form) !== baseline.value,
  )
  const locked = computed(() => busy.value || unknown.value)
  const activeStep = computed(() => form.steps.find((step) => step.id === activeStepId.value))
  let generation = 0,
    serial = 0,
    credential = token.get()
  let reader: AbortController | undefined, writer: AbortController | undefined
  let pending: Operation | undefined
  function clear() {
    generation++
    serial++
    reader?.abort()
    writer?.abort()
    pending = undefined
    rows.value = []
    original.value = undefined
    Object.assign(form, blankDemoScript())
    baseline.value = JSON.stringify(form)
    pageIndex.value = total.value = 0
    activeStepId.value = ''
    mode.value = 'list'
    loading.value =
      busy.value =
      unknown.value =
      conflict.value =
      denied.value =
      invalid.value =
        false
    error.value = notice.value = ''
  }
  function unavailable() {
    clear()
    denied.value = true
    error.value = t('proto.demoUnavailable')
  }
  function current(epoch: number) {
    if (epoch !== generation) return false
    if (!isPublic.value && credential !== token.get()) {
      unavailable()
      return false
    }
    return true
  }
  function checkSummary(row: DemoScriptSummary | PublicDemoScriptSummary, detail = false) {
    const selected = authorized.value
    const keys = selected?.kind === 'public' ? publicKeys : summaryKeys
    if (
      !selected ||
      !exact(row, detail ? [...keys, ...bodyKeys] : keys) ||
      typeof row.id !== 'string' ||
      !row.id ||
      row.id.length > 128 ||
      previewIdentity(row.id) !== row.id ||
      row.revisionId !== selected.context.revisionId ||
      !demoText(row.title, 120, true)
    )
      throw new ApiError('Unavailable', 404)
    if (selected.kind === 'member') {
      const member = row as DemoScriptSummary
      if (
        member.projectId !== selected.project.id ||
        member.versionId !== selected.revision.versionId ||
        typeof member.shareEnabled !== 'boolean' ||
        !Number.isSafeInteger(member.configVersion) ||
        member.configVersion < 0 ||
        !Number.isSafeInteger(member.createdAt) ||
        !Number.isSafeInteger(member.updatedAt)
      )
        throw new ApiError('Unavailable', 404)
    }
  }
  function checkDetail(row: DemoScript | PublicDemoScript, id: string) {
    checkSummary(row, true)
    const value = { ...row, shareEnabled: 'shareEnabled' in row ? row.shareEnabled : false }
    if (
      row.id !== id ||
      !validDemoScript(value, pageIds.value) ||
      row.steps.some((step) => !exact(step, ['id', 'pageId', 'narration']))
    )
      throw new ApiError('Unavailable', 404)
  }
  function apply(row: DemoScript | PublicDemoScript) {
    original.value = row
    Object.assign(
      form,
      copyDraft({ ...row, shareEnabled: 'shareEnabled' in row ? row.shareEnabled : false }),
    )
    baseline.value = JSON.stringify(form)
    if (!form.steps.some((step) => step.id === activeStepId.value))
      activeStepId.value = form.steps[0]?.id || ''
    invalid.value = false
  }
  function failure(cause: unknown) {
    if (cause instanceof ApiError && [401, 403].includes(cause.status)) unavailable()
    else
      error.value = t(
        cause instanceof ApiError && cause.status === 404
          ? 'proto.demoUnavailable'
          : 'proto.demoLoadFailed',
      )
  }
  async function load(index = pageIndex.value) {
    if (!current(generation)) return
    const selected = authorized.value
    if (!selected || denied.value || locked.value) return
    reader?.abort()
    const request = (reader = new AbortController()),
      epoch = generation,
      sequence = ++serial
    loading.value = true
    error.value = ''
    try {
      const options = { signal: request.signal, silent: true }
      const result =
        selected.kind === 'public'
          ? await api.publicQuery(selected.share, index, options)
          : await api.query(selected.revision.versionId, selected.revision.id, index, options)
      if (!current(epoch) || sequence !== serial || request.signal.aborted) return
      if (
        !result ||
        !Array.isArray(result.data) ||
        result.data.length > 20 ||
        !Number.isSafeInteger(result.total) ||
        result.total < 0 ||
        result.pageIndex !== index ||
        result.pageSize !== 20
      )
        throw new ApiError('Unavailable', 404)
      result.data.forEach((row) => checkSummary(row))
      rows.value = result.data
      total.value = result.total
      pageIndex.value = index
    } catch (cause) {
      if (current(epoch) && sequence === serial && !request.signal.aborted) {
        rows.value = []
        total.value = 0
        failure(cause)
      }
    } finally {
      if (current(epoch) && sequence === serial) loading.value = false
    }
  }
  async function open(id: string, stepId?: string, refresh = false) {
    if (!current(generation)) return false
    const selected = authorized.value
    if (!selected || denied.value || locked.value) return false
    reader?.abort()
    const request = (reader = new AbortController()),
      epoch = generation,
      sequence = ++serial
    loading.value = true
    error.value = ''
    if (!refresh) original.value = undefined
    try {
      const options = { signal: request.signal, silent: true }
      const row =
        selected.kind === 'public'
          ? await api.publicGet(selected.share, id, options)
          : await api.get(selected.revision.versionId, selected.revision.id, id, options)
      if (!current(epoch) || sequence !== serial || request.signal.aborted) return false
      checkDetail(row, id)
      if (stepId && !row.steps.some((step) => step.id === stepId))
        throw new ApiError('Unavailable', 404)
      if (refresh) {
        original.value = row
        conflict.value = false
        notice.value = t('proto.demoRefreshed')
      } else {
        apply(row)
        activeStepId.value = stepId || row.steps[0].id
        mode.value = stepId || !canEdit.value ? 'rehearse' : 'edit'
        notice.value = ''
      }
      return true
    } catch (cause) {
      if (current(epoch) && sequence === serial && !request.signal.aborted) {
        if (!refresh) {
          Object.assign(form, blankDemoScript())
          baseline.value = JSON.stringify(form)
          mode.value = 'list'
        }
        failure(cause)
      }
      return false
    } finally {
      if (current(epoch) && sequence === serial) loading.value = false
    }
  }
  function create() {
    if (!canEdit.value || locked.value) return
    original.value = undefined
    Object.assign(form, blankDemoScript())
    baseline.value = JSON.stringify(form)
    activeStepId.value = ''
    mode.value = 'edit'
    error.value = notice.value = ''
    conflict.value = invalid.value = false
  }
  function addStep() {
    if (!canEdit.value || locked.value || form.steps.length >= 50 || !pages.value.length) return
    const step = { id: secureId(), pageId: pages.value[0].pageId, narration: '' }
    form.steps.push(step)
    activeStepId.value = step.id
  }
  function removeStep(id: string) {
    if (!canEdit.value || locked.value) return
    const index = form.steps.findIndex((step) => step.id === id)
    if (index < 0) return
    form.steps.splice(index, 1)
    if (activeStepId.value === id)
      activeStepId.value = form.steps[Math.min(index, form.steps.length - 1)]?.id || ''
  }
  function moveStep(id: string, offset: number) {
    if (!canEdit.value || locked.value) return
    const index = form.steps.findIndex((step) => step.id === id),
      next = index + offset
    if (index < 0 || next < 0 || next >= form.steps.length) return
    const [step] = form.steps.splice(index, 1)
    form.steps.splice(next, 0, step)
    activeStepId.value = id
  }
  async function execute(operation: Operation) {
    if (!current(generation)) return
    const selected = authorized.value
    if (selected?.kind !== 'member' || !canEdit.value || busy.value) return
    reader?.abort()
    serial++
    loading.value = false
    const request = (writer = new AbortController()),
      epoch = generation
    pending = operation
    busy.value = true
    error.value = notice.value = ''
    try {
      const options = { signal: request.signal, silent: true }
      const row =
        operation.kind === 'delete'
          ? await api.remove(
              selected.revision.versionId,
              selected.revision.id,
              operation.id,
              operation.input,
              options,
            )
          : operation.kind === 'create'
            ? await api.create(
                selected.revision.versionId,
                selected.revision.id,
                operation.input,
                options,
              )
            : await api.update(
                selected.revision.versionId,
                selected.revision.id,
                operation.id,
                operation.input,
                options,
              )
      if (!current(epoch) || request.signal.aborted) return
      if (operation.kind === 'delete') {
        if (row !== true) throw new Error('Invalid receipt')
        original.value = undefined
        Object.assign(form, blankDemoScript())
        baseline.value = JSON.stringify(form)
        mode.value = 'list'
      } else {
        if (typeof row === 'boolean') throw new Error('Invalid receipt')
        checkDetail(row, operation.kind === 'create' ? row.id : operation.id)
        apply(row)
      }
      pending = undefined
      unknown.value = conflict.value = false
      notice.value = t(operation.kind === 'delete' ? 'proto.demoDeleted' : 'proto.demoSaved')
    } catch (cause) {
      if (!current(epoch) || request.signal.aborted) return
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) unavailable()
      else if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        pending = undefined
        unknown.value = false
        conflict.value = cause.status === 409
        error.value = t(conflict.value ? 'proto.demoConflict' : 'proto.demoRejected')
      } else {
        unknown.value = true
        error.value = t('proto.demoUnknown')
      }
    } finally {
      if (current(epoch)) busy.value = false
    }
    if (current(epoch) && !unknown.value && !conflict.value && !denied.value) void load()
  }
  function save() {
    if (!canEdit.value || locked.value || conflict.value) return
    invalid.value = !validDemoScript(form, pageIds.value)
    if (invalid.value) return
    const input = copyDraft(form)
    input.steps.forEach(Object.freeze)
    Object.freeze(input.steps)
    const payload = Object.freeze({ ...input, clientRequestId: secureId() })
    return execute(
      original.value && 'configVersion' in original.value
        ? {
            kind: 'update',
            id: original.value.id,
            input: Object.freeze({ ...payload, expectedVersion: original.value.configVersion }),
          }
        : { kind: 'create', input: payload },
    )
  }
  function remove() {
    if (
      !canEdit.value ||
      locked.value ||
      conflict.value ||
      !original.value ||
      !('configVersion' in original.value)
    )
      return
    return execute({
      kind: 'delete',
      id: original.value.id,
      input: Object.freeze({
        clientRequestId: secureId(),
        expectedVersion: original.value.configVersion,
      }),
    })
  }
  function retry() {
    if (unknown.value && pending && !busy.value) return execute(pending)
  }
  function checkCredential() {
    if (!isPublic.value && credential !== token.get()) unavailable()
  }
  window.addEventListener('storage', checkCredential)
  window.addEventListener('focus', checkCredential)
  watch(
    () => {
      const value = authorized.value
      return JSON.stringify(
        value?.kind === 'public'
          ? [value.kind, value.share.token, value.share.accessKey, value.share.revisionId]
          : value && [
              value.kind,
              value.actorId,
              value.project.id,
              value.revision.versionId,
              value.revision.id,
              projectAllows(value.project, 'edit') && permissions.can(p.version.save),
            ],
      )
    },
    () => {
      clear()
      credential = token.get()
      if (scope.value && !authorized.value) unavailable()
      else void load(0)
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    window.removeEventListener('storage', checkCredential)
    window.removeEventListener('focus', checkCredential)
    clear()
  })
  return {
    authorized,
    isPublic,
    canEdit,
    denied,
    pages,
    form,
    original,
    rows,
    pageIndex,
    total,
    activeStepId,
    activeStep,
    mode,
    loading,
    busy,
    unknown,
    conflict,
    error,
    notice,
    invalid,
    dirty,
    locked,
    load,
    open,
    create,
    addStep,
    removeStep,
    moveStep,
    save,
    remove,
    retry,
  }
}
