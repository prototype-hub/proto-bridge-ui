import { computed, onScopeDispose, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import { usePermissions } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { secureId } from '@/shared/utils/secure-id'
import { t } from '@/shared/i18n'
import { protoPermissions as p } from '../routes/permissions'
import { projectAllows } from '../utils/project-access'
import { flattenPages, selectablePage, stablePageId } from '../utils/preview-location'
import { viewportCheckApi } from '../api/viewport-check'
import {
  viewportCategories,
  viewportResults,
  type ViewportCheck,
  type ViewportDraft,
  type ViewportInput,
  type ViewportPage,
  type ViewportTarget,
} from '../types/viewport-check'
import type { Project, Revision, ReviewPage, WorkspaceContext } from '../types'

export interface ViewportScope {
  actorId: string
  project: Project
  revision: Revision
  context: WorkspaceContext
  initialPage?: ReviewPage
}
type Operation =
  | { kind: 'create'; input: ViewportInput }
  | { kind: 'update'; id: string; input: ViewportInput & { expectedVersion: number } }
  | { kind: 'delete'; id: string; input: { clientRequestId: string; expectedVersion: number } }
const blank = (): ViewportDraft => ({
  title: '',
  category: 'normal',
  steps: '',
  expected: '',
  observed: '',
  evidence: '',
  result: 'untested',
  viewportWidth: 1440,
  viewportHeight: 900,
  viewportScale: 100,
})
function draft(row: ViewportCheck): ViewportDraft {
  return {
    title: row.title,
    category: row.category.value,
    steps: row.steps || '',
    expected: row.expected,
    observed: row.observed || '',
    evidence: row.evidence || '',
    result: row.result.value,
    viewportWidth: row.viewportWidth,
    viewportHeight: row.viewportHeight,
    viewportScale: row.viewportScale,
  }
}

/** Drafts and exact write receipts belong to one actor, immutable revision and manifest page. */
export function useViewportChecks(scope: Ref<ViewportScope | undefined>) {
  const permissions = usePermissions()
  const authorized = computed(() => {
    const value = scope.value
    return value?.actorId &&
      value.project.id === value.revision.projectId &&
      value.context.revisionId === value.revision.id &&
      projectAllows(value.project, 'read') &&
      permissions.can(p.version.query)
      ? value
      : undefined
  })
  const denied = ref(false)
  const canEdit = computed(
    () =>
      !!authorized.value &&
      !denied.value &&
      projectAllows(authorized.value.project, 'edit') &&
      permissions.can(p.version.save),
  )
  const pages = computed<ReviewPage[]>(() => {
    const value = authorized.value
    if (!value) return []
    return flattenPages(value.context.pages).flatMap((page) => {
      const id = stablePageId(page, value.context.pages)
      return id && page.path && selectablePage(page, value.context.runtimeBaseUrl)
        ? [{ pageId: id, revisionId: value.revision.id, path: page.path, name: page.name }]
        : []
    })
  })
  const pageId = ref('')
  const page = computed(() => pages.value.find((item) => item.pageId === pageId.value))
  const target = computed<ViewportTarget | undefined>(() =>
    authorized.value && page.value
      ? {
          versionId: authorized.value.revision.versionId,
          revisionId: authorized.value.revision.id,
          pageId: page.value.pageId,
        }
      : undefined,
  )
  const form = reactive<ViewportDraft>(blank())
  const baseline = ref(JSON.stringify(form))
  const original = shallowRef<ViewportCheck>()
  const result = shallowRef<ViewportPage>()
  const pageIndex = ref(0)
  const loading = ref(false),
    busy = ref(false),
    unknown = ref(false),
    conflict = ref(false)
  const error = ref(''),
    notice = ref('')
  const invalid = reactive<Partial<Record<keyof ViewportDraft, string>>>({})
  const dirty = computed(() => canEdit.value && JSON.stringify(form) !== baseline.value)
  const locked = computed(() => busy.value || unknown.value)
  const filters = reactive({
    category: '' as '' | ViewportDraft['category'],
    result: '' as '' | ViewportDraft['result'],
  })
  let generation = 0,
    querySequence = 0
  let pending: Operation | undefined
  let readController: AbortController | undefined, writeController: AbortController | undefined
  function resetEditor(row?: ViewportCheck) {
    original.value = row
    Object.assign(form, row ? draft(row) : blank())
    baseline.value = JSON.stringify(form)
    Object.keys(invalid).forEach((key) => delete invalid[key as keyof ViewportDraft])
    pending = undefined
    unknown.value = conflict.value = false
  }
  function clear() {
    generation++
    querySequence++
    readController?.abort()
    writeController?.abort()
    result.value = undefined
    loading.value = busy.value = false
    error.value = notice.value = ''
    denied.value = false
    pageIndex.value = 0
    resetEditor()
  }
  function deny(cause: unknown) {
    if (!(cause instanceof ApiError) || ![401, 403, 404].includes(cause.status)) return false
    clear()
    denied.value = true
    error.value = t('proto.viewportUnavailable')
    return true
  }
  function checkRow(row: ViewportCheck, selected: ViewportTarget) {
    if (
      !row ||
      row.projectId !== authorized.value?.project.id ||
      row.versionId !== selected.versionId ||
      row.revisionId !== selected.revisionId ||
      row.pageId !== selected.pageId ||
      !row.id ||
      !Number.isSafeInteger(row.configVersion) ||
      row.configVersion < 0 ||
      !viewportCategories.includes(row.category?.value) ||
      !viewportResults.includes(row.result?.value) ||
      !Number.isInteger(row.viewportWidth) ||
      row.viewportWidth < 240 ||
      row.viewportWidth > 3840 ||
      !Number.isInteger(row.viewportHeight) ||
      row.viewportHeight < 240 ||
      row.viewportHeight > 3840 ||
      !Number.isInteger(row.viewportScale) ||
      row.viewportScale < 25 ||
      row.viewportScale > 200
    )
      throw new ApiError(t('proto.viewportUnavailable'), 404)
  }
  async function load() {
    const selected = target.value
    if (!selected || busy.value) return
    readController?.abort()
    const controller = new AbortController(),
      epoch = generation,
      sequence = ++querySequence
    readController = controller
    loading.value = true
    if (!conflict.value && !unknown.value) error.value = ''
    try {
      const value = await viewportCheckApi.query(
        selected,
        {
          pageIndex: pageIndex.value,
          pageSize: 20,
          category: filters.category || undefined,
          result: filters.result || undefined,
        },
        { signal: controller.signal, silent: true },
      )
      if (epoch !== generation || sequence !== querySequence || controller.signal.aborted) return
      value.data.forEach((row) => checkRow(row, selected))
      denied.value = false
      result.value = value
    } catch (cause) {
      if (epoch !== generation || sequence !== querySequence || controller.signal.aborted) return
      if (!deny(cause))
        error.value = [
          conflict.value
            ? t('proto.viewportConflict')
            : unknown.value
              ? t('proto.viewportUnknown')
              : '',
          t('proto.viewportLoadFailed'),
        ]
          .filter(Boolean)
          .join(' ')
    } finally {
      if (sequence === querySequence) loading.value = false
    }
  }
  function selectPage(id: string) {
    if (locked.value || !pages.value.some((item) => item.pageId === id)) return
    clear()
    pageId.value = id
    filters.category = filters.result = ''
    void load()
  }
  function select(row?: ViewportCheck) {
    if (locked.value) return
    if (row && target.value) checkRow(row, target.value)
    resetEditor(row)
    notice.value = error.value = ''
  }
  function validate() {
    Object.keys(invalid).forEach((key) => delete invalid[key as keyof ViewportDraft])
    if (!form.title.trim() || form.title.length > 120)
      invalid.title = t('proto.viewportTitleRequired')
    if (!form.expected.trim() || form.expected.length > 2000)
      invalid.expected = t('proto.viewportExpectedRequired')
    if (form.result !== 'untested' && !form.observed.trim())
      invalid.observed = t('proto.viewportObservedRequired')
    for (const key of ['steps', 'observed', 'evidence'] as const)
      if (form[key].length > 2000) invalid[key] = t('proto.viewportTextLimit')
    for (const key of ['viewportWidth', 'viewportHeight', 'viewportScale'] as const) {
      const min = key === 'viewportScale' ? 25 : 240,
        max = key === 'viewportScale' ? 200 : 3840
      if (!Number.isInteger(form[key]) || form[key] < min || form[key] > max)
        invalid[key] = t('proto.viewportSizeInvalid', { min, max })
    }
    return Object.keys(invalid).length === 0
  }
  async function execute(operation: Operation) {
    const selected = target.value
    if (!selected || !canEdit.value || busy.value) return
    readController?.abort()
    querySequence++
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
          ? await viewportCheckApi.create(selected, operation.input, options)
          : operation.kind === 'update'
            ? await viewportCheckApi.update(selected, operation.id, operation.input, options)
            : await viewportCheckApi.remove(selected, operation.id, operation.input, options)
      if (epoch !== generation || controller.signal.aborted || !canEdit.value) return
      if (operation.kind === 'delete') {
        if (value !== true) throw new ApiError(t('proto.viewportUnknown'), 502)
        resetEditor()
      } else {
        checkRow(value as ViewportCheck, selected)
        resetEditor(value as ViewportCheck)
      }
      notice.value = t(
        operation.kind === 'delete' ? 'proto.viewportDeleted' : 'proto.viewportSaved',
      )
      pageIndex.value = 0
    } catch (cause) {
      if (epoch !== generation || controller.signal.aborted) return
      if (deny(cause)) return
      if (cause instanceof ApiError && cause.status === 409) {
        conflict.value = true
        unknown.value = false
        pending = undefined
        error.value = t('proto.viewportConflict')
      } else if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 408 &&
        cause.status !== 429
      ) {
        unknown.value = false
        pending = undefined
        error.value = t('proto.viewportRejected')
      } else {
        unknown.value = true
        error.value = t('proto.viewportUnknown')
      }
    } finally {
      if (epoch === generation) {
        busy.value = false
        if (!unknown.value && !denied.value) void load()
      }
    }
  }
  function save() {
    if (!canEdit.value || locked.value || conflict.value || !validate()) return
    const input: ViewportInput = { ...form, title: form.title.trim(), clientRequestId: secureId() }
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
    if (!canEdit.value || locked.value || conflict.value || !original.value) return
    void execute({
      kind: 'delete',
      id: original.value.id,
      input: { clientRequestId: secureId(), expectedVersion: original.value.configVersion },
    })
  }
  function retry() {
    if (unknown.value && pending) void execute(pending)
  }
  function query(index = 0) {
    if (!locked.value) {
      pageIndex.value = index
      void load()
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
          pages.value,
        ],
      ),
    () => {
      clear()
      const initial = authorized.value?.initialPage
      const exact =
        initial &&
        pages.value.find(
          (item) =>
            item.pageId === initial.pageId &&
            item.path === initial.path &&
            item.revisionId === initial.revisionId,
        )
      pageId.value = (exact || (initial ? undefined : pages.value[0]))?.pageId || ''
      if (!pageId.value) error.value = t('proto.viewportUnavailable')
      else void load()
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
    () => {
      Object.keys(invalid).forEach((key) => delete invalid[key as keyof ViewportDraft])
    },
    { flush: 'sync' },
  )
  onScopeDispose(clear)
  return {
    pages,
    page,
    pageId,
    target,
    canEdit,
    denied,
    form,
    original,
    result,
    pageIndex,
    filters,
    loading,
    busy,
    unknown,
    conflict,
    locked,
    dirty,
    error,
    notice,
    invalid,
    load,
    selectPage,
    select,
    save,
    remove,
    retry,
    query,
  }
}
