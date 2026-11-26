import { computed, onScopeDispose, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import { usePermissions } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { secureId } from '@/shared/utils/secure-id'
import { t } from '@/shared/i18n'
import { protoPermissions as p } from '../routes/permissions'
import { projectAllows } from '../utils/project-access'
import { flattenPages, selectablePage, stablePageId } from '../utils/preview-location'
import { isReviewAnchor } from '../utils/review-anchor'
import { functionalSpecApi } from '../api/functional-spec'
import type {
  FunctionalDraft,
  FunctionalInput,
  FunctionalPage,
  FunctionalSpec,
  FunctionalTarget,
} from '../types/functional-spec'
import type { Project, Revision, ReviewPage, WorkspaceContext } from '../types'

export interface FunctionalScope {
  actorId: string
  project: Project
  revision: Revision
  context: WorkspaceContext
  page: ReviewPage
}
type Operation =
  | { kind: 'create'; input: FunctionalInput }
  | { kind: 'update'; id: string; input: FunctionalInput & { expectedVersion: number } }
  | {
      kind: 'delete'
      id: string
      input: {
        revisionId: string
        pageId: string
        clientRequestId: string
        expectedVersion: number
      }
    }
const blank = (): FunctionalDraft => ({
  title: '',
  purpose: '',
  inputRules: '',
  permissionRules: '',
  navigationRules: '',
  notes: '',
  anchor: null,
})
const fields = [
  'title',
  'purpose',
  'inputRules',
  'permissionRules',
  'navigationRules',
  'notes',
] as const
function draft(row: FunctionalSpec): FunctionalDraft {
  return {
    ...Object.fromEntries(fields.map((key) => [key, row[key] || ''])),
    anchor: row.anchor ? { ...row.anchor } : null,
  } as FunctionalDraft
}

/** Private drafts and write receipts are isolated by actor and immutable manifest page. */
export function useFunctionalSpecs(scope: Ref<FunctionalScope | undefined>) {
  const permissions = usePermissions()
  const authorized = computed(() => {
    const value = scope.value
    if (
      !value?.actorId ||
      value.project.id !== value.revision.projectId ||
      value.context.revisionId !== value.revision.id ||
      value.page.revisionId !== value.revision.id ||
      !projectAllows(value.project, 'read') ||
      !permissions.can(p.version.query)
    )
      return undefined
    const exact = flattenPages(value.context.pages).some(
      (page) =>
        stablePageId(page, value.context.pages) === value.page.pageId &&
        page.path === value.page.path &&
        selectablePage(page, value.context.runtimeBaseUrl),
    )
    return exact ? value : undefined
  })
  const denied = ref(false)
  const canEdit = computed(
    () =>
      !!authorized.value &&
      !denied.value &&
      projectAllows(authorized.value.project, 'edit') &&
      permissions.can(p.version.save),
  )
  const target = computed<FunctionalTarget | undefined>(() =>
    authorized.value
      ? {
          versionId: authorized.value.revision.versionId,
          revisionId: authorized.value.revision.id,
          pageId: authorized.value.page.pageId,
        }
      : undefined,
  )
  const form = reactive<FunctionalDraft>(blank())
  const original = shallowRef<FunctionalSpec>()
  const baseline = ref(JSON.stringify(form))
  const editing = ref(false)
  const result = shallowRef<FunctionalPage>()
  const search = ref(''),
    appliedSearch = ref(''),
    pageIndex = ref(0)
  const loading = ref(false),
    busy = ref(false),
    unknown = ref(false),
    conflict = ref(false)
  const serverRecord = shallowRef<FunctionalSpec>()
  const error = ref(''),
    notice = ref('')
  const invalid = reactive<Partial<Record<keyof FunctionalDraft, string>>>({})
  const dirty = computed(
    () => canEdit.value && editing.value && JSON.stringify(form) !== baseline.value,
  )
  const locked = computed(() => busy.value || unknown.value)
  let generation = 0,
    sequence = 0
  let pending: Operation | undefined
  let readController: AbortController | undefined, writeController: AbortController | undefined
  function select(row?: FunctionalSpec) {
    if (locked.value) return
    if (row && target.value) checkRow(row, target.value)
    original.value = row
    Object.assign(form, row ? draft(row) : blank())
    baseline.value = JSON.stringify(form)
    editing.value = true
    pending = undefined
    unknown.value = conflict.value = false
    serverRecord.value = undefined
    error.value = notice.value = ''
    Object.keys(invalid).forEach((key) => delete invalid[key as keyof FunctionalDraft])
  }
  function clear() {
    generation++
    sequence++
    readController?.abort()
    writeController?.abort()
    result.value = original.value = serverRecord.value = undefined
    pending = undefined
    busy.value =
      loading.value =
      unknown.value =
      conflict.value =
      editing.value =
      denied.value =
        false
    error.value = notice.value = search.value = appliedSearch.value = ''
    pageIndex.value = 0
    Object.assign(form, blank())
    baseline.value = JSON.stringify(form)
    Object.keys(invalid).forEach((key) => delete invalid[key as keyof FunctionalDraft])
  }
  function deny(cause: unknown) {
    if (!(cause instanceof ApiError) || ![401, 403, 404].includes(cause.status)) return false
    clear()
    denied.value = true
    error.value = t('proto.specUnavailable')
    return true
  }
  function checkRow(row: FunctionalSpec, selected: FunctionalTarget) {
    if (
      !row ||
      row.projectId !== authorized.value?.project.id ||
      row.versionId !== selected.versionId ||
      row.revisionId !== selected.revisionId ||
      row.pageId !== selected.pageId ||
      !row.id ||
      !Number.isSafeInteger(row.configVersion) ||
      row.configVersion < 0 ||
      fields.some(
        (key) =>
          typeof row[key] !== 'string' ||
          row[key].length > (key === 'title' ? 120 : key === 'notes' ? 4000 : 2000),
      ) ||
      !row.title.trim() ||
      (row.anchor != null && !isReviewAnchor(row.anchor))
    )
      throw new ApiError(t('proto.specUnavailable'), 404)
  }
  async function load() {
    const selected = target.value
    if (!selected || busy.value || denied.value) return
    readController?.abort()
    const controller = new AbortController(),
      epoch = generation,
      request = ++sequence
    readController = controller
    loading.value = true
    if (!unknown.value && !conflict.value) error.value = ''
    try {
      const value = await functionalSpecApi.query(
        selected,
        { pageIndex: pageIndex.value, pageSize: 20, keyword: appliedSearch.value || undefined },
        { signal: controller.signal, silent: true },
      )
      if (epoch !== generation || request !== sequence || controller.signal.aborted) return
      value.data.forEach((row) => checkRow(row, selected))
      result.value = value
    } catch (cause) {
      if (epoch !== generation || request !== sequence || controller.signal.aborted) return
      if (!deny(cause)) error.value = t('proto.specLoadFailed')
    } finally {
      if (request === sequence) loading.value = false
    }
  }
  function query(index = 0) {
    if (locked.value) return
    pageIndex.value = index
    appliedSearch.value = search.value.trim()
    void load()
  }
  function validate() {
    Object.keys(invalid).forEach((key) => delete invalid[key as keyof FunctionalDraft])
    fields.forEach((key) => {
      const max = key === 'title' ? 120 : key === 'notes' ? 4000 : 2000
      if ((key === 'title' && !form.title.trim()) || form[key].length > max)
        invalid[key] = t(key === 'title' ? 'proto.specTitleRequired' : 'proto.specTextLimit', {
          max,
        })
    })
    return !Object.keys(invalid).length
  }
  async function execute(operation: Operation) {
    const selected = target.value
    if (!selected || !canEdit.value || busy.value) return
    readController?.abort()
    sequence++
    loading.value = false
    const controller = new AbortController(),
      epoch = generation
    writeController = controller
    pending = operation
    busy.value = true
    error.value = notice.value = ''
    try {
      const options = { signal: controller.signal, silent: true }
      const value =
        operation.kind === 'create'
          ? await functionalSpecApi.create(selected, operation.input, options)
          : operation.kind === 'update'
            ? await functionalSpecApi.update(selected, operation.id, operation.input, options)
            : await functionalSpecApi.remove(selected, operation.id, operation.input, options)
      if (epoch !== generation || controller.signal.aborted || !canEdit.value) return
      busy.value = unknown.value = false
      if (operation.kind === 'delete') {
        if (value !== true) throw new ApiError(t('proto.specUnknown'), 502)
        select()
        editing.value = false
      } else {
        checkRow(value as FunctionalSpec, selected)
        select(value as FunctionalSpec)
      }
      notice.value = t(operation.kind === 'delete' ? 'proto.specDeleted' : 'proto.specSaved')
      pageIndex.value = 0
    } catch (cause) {
      if (epoch !== generation || controller.signal.aborted) return
      if (
        cause instanceof ApiError &&
        cause.code === 'PROTOTYPE_HUB_ELEMENT_DESCRIPTION_NOT_FOUND'
      ) {
        conflict.value = true
        unknown.value = false
        pending = undefined
        error.value = t('proto.specGone')
        return
      }
      if (deny(cause)) return
      if (cause instanceof ApiError && cause.status === 409) {
        conflict.value = true
        unknown.value = false
        pending = undefined
        error.value = t(original.value ? 'proto.specConflict' : 'proto.specCreateConflict')
      } else if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        ![408, 429].includes(cause.status)
      ) {
        unknown.value = false
        pending = undefined
        error.value = t('proto.specRejected')
      } else {
        unknown.value = true
        error.value = t('proto.specUnknown')
      }
    } finally {
      if (epoch === generation) {
        busy.value = false
        if (!unknown.value && !denied.value) void load()
      }
    }
  }
  function save() {
    if (!target.value || !canEdit.value || locked.value || conflict.value || !validate()) return
    const input: FunctionalInput = {
      ...JSON.parse(JSON.stringify(form)),
      title: form.title.trim(),
      revisionId: target.value.revisionId,
      pageId: target.value.pageId,
      clientRequestId: secureId(),
    }
    void execute(
      original.value
        ? {
            kind: 'update',
            id: original.value.id,
            input: { ...input, expectedVersion: original.value.configVersion },
          }
        : { kind: 'create', input },
    )
  }
  function remove() {
    if (!target.value || !canEdit.value || locked.value || conflict.value || !original.value) return
    void execute({
      kind: 'delete',
      id: original.value.id,
      input: {
        revisionId: target.value.revisionId,
        pageId: target.value.pageId,
        clientRequestId: secureId(),
        expectedVersion: original.value.configVersion,
      },
    })
  }
  function retry() {
    if (unknown.value && pending) void execute(pending)
  }
  async function readConflict() {
    const selected = target.value,
      id = original.value?.id
    if (!selected || !id || !conflict.value || locked.value) return
    readController?.abort()
    serverRecord.value = undefined
    const controller = new AbortController(),
      epoch = generation,
      request = ++sequence
    readController = controller
    loading.value = true
    try {
      const row = await functionalSpecApi.get(selected, id, {
        signal: controller.signal,
        silent: true,
      })
      if (
        epoch !== generation ||
        request !== sequence ||
        controller.signal.aborted ||
        original.value?.id !== id ||
        !conflict.value
      )
        return
      checkRow(row, selected)
      serverRecord.value = row
    } catch (cause) {
      if (epoch !== generation || request !== sequence || controller.signal.aborted) return
      if (cause instanceof ApiError && cause.code === 'PROTOTYPE_HUB_ELEMENT_DESCRIPTION_NOT_FOUND')
        error.value = t('proto.specGone')
      else if (!deny(cause)) error.value = t('proto.specLoadFailed')
    } finally {
      if (request === sequence) loading.value = false
    }
  }

  watch(
    () =>
      JSON.stringify(
        authorized.value && [
          authorized.value.actorId,
          authorized.value.project.id,
          authorized.value.revision.id,
          authorized.value.context.runtimeBaseUrl,
          authorized.value.page,
        ],
      ),
    () => {
      clear()
      if (target.value) void load()
    },
    { immediate: true, flush: 'sync' },
  )
  watch(
    () =>
      !!authorized.value &&
      projectAllows(authorized.value.project, 'edit') &&
      permissions.can(p.version.save),
    (value, previous) => {
      if (!value && previous) {
        clear()
        if (target.value) void load()
      }
    },
    { flush: 'sync' },
  )
  watch(
    form,
    () => Object.keys(invalid).forEach((key) => delete invalid[key as keyof FunctionalDraft]),
    { flush: 'sync' },
  )
  onScopeDispose(clear)
  return {
    target,
    canEdit,
    denied,
    form,
    original,
    editing,
    result,
    search,
    appliedSearch,
    pageIndex,
    loading,
    busy,
    unknown,
    conflict,
    serverRecord,
    locked,
    dirty,
    error,
    notice,
    invalid,
    load,
    query,
    select,
    save,
    remove,
    retry,
    readConflict,
  }
}
