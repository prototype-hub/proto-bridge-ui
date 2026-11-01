import { computed, onScopeDispose, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import type { Project, Revision, ReviewPage, PrototypePage } from '../types'
import type {
  CopyInventoryEntry,
  CopyInventoryInput,
  CopyInventoryPage,
  CopyInventoryQuery,
  CopyInventorySnapshot,
  CopyInventoryTarget,
} from '../types/copy-inventory'
import { copyInventoryApi } from '../api/copy-inventory'
import { versionsApi } from '../api/version'
import { projectAllows } from '../utils/project-access'
import { safeWorkItemUrl } from '../views/project/hooks/useWorkItems'
import { protoPermissions as p } from '../routes/permissions'
import { usePermissions } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { download } from '@/shared/api/client'
import { secureId } from '@/shared/utils/secure-id'
import { t } from '@/shared/i18n'

export interface CopyInventoryScope {
  actorId: string
  project: Project
  revision: Revision
  initialPage?: ReviewPage
}
type Operation =
  | { kind: 'extract'; input: { clientRequestId: string } }
  | { kind: 'create'; input: CopyInventoryInput }
  | { kind: 'update'; id: string; input: CopyInventoryInput & { expectedVersion: number } }
  | { kind: 'delete'; id: string; input: { clientRequestId: string; expectedVersion: number } }

/** A draft, receipt and all late responses belong to one actor and immutable manifest page. */
export function useCopyInventory(scope: Ref<CopyInventoryScope | undefined>) {
  const permissions = usePermissions()
  const authorized = computed(() => {
    const value = scope.value
    return value?.actorId &&
      value.project.id === value.revision.projectId &&
      projectAllows(value.project, 'read') &&
      permissions.can(p.version.query)
      ? value
      : undefined
  })
  const canEdit = computed(
    () =>
      !!authorized.value &&
      projectAllows(authorized.value.project, 'edit') &&
      permissions.can(p.version.save),
  )
  const pages = shallowRef<ReviewPage[]>([]),
    pageId = ref('')
  const page = computed(() => pages.value.find((item) => item.pageId === pageId.value))
  const target = computed<CopyInventoryTarget | undefined>(() =>
    authorized.value && page.value
      ? {
          versionId: authorized.value.revision.versionId,
          revisionId: authorized.value.revision.id,
          pageId: page.value.pageId,
        }
      : undefined,
  )
  const result = shallowRef<CopyInventoryPage>(),
    snapshot = computed(() => result.value?.snapshot)
  const loading = ref(false),
    pagesLoading = ref(false),
    busy = ref(false),
    exporting = ref(false)
  const error = ref(''),
    notice = ref(''),
    exportError = ref(''),
    unknown = ref(false),
    conflict = ref(false)
  const editing = ref(false),
    original = shallowRef<CopyInventoryEntry>()
  const form = reactive({ text: '', businessTerm: '', note: '', requirementUrl: '' })
  const invalid = reactive({ text: '', businessTerm: '', note: '', requirementUrl: '' })
  for (const field of ['text', 'businessTerm', 'note', 'requirementUrl'] as const)
    watch(
      () => form[field],
      () => (invalid[field] = ''),
      { flush: 'sync' },
    )
  const filters = reactive({
    keyword: '',
    kind: '' as '' | 'STATIC' | 'MANUAL',
    requirement: '' as '' | 'yes' | 'no',
  })
  const applied = shallowRef<Pick<CopyInventoryQuery, 'keyword' | 'kind' | 'hasRequirement'>>({})
  const filtered = computed(
    () =>
      !!applied.value.keyword || !!applied.value.kind || applied.value.hasRequirement !== undefined,
  )
  const pageIndex = ref(0)
  const dirty = computed(
    () =>
      editing.value &&
      Object.entries(form).some(
        ([key, value]) => value !== (original.value?.[key as keyof typeof form] || ''),
      ),
  )
  const locked = computed(() => busy.value || unknown.value || exporting.value)
  const extracted = computed(
    () => !!snapshot.value?.snapshotId && snapshot.value.extractionState !== 'NOT_EXTRACTED',
  )
  let pagesSequence = 0
  let generation = 0,
    querySequence = 0,
    pending: Operation | undefined
  let readController: AbortController | undefined,
    pagesController: AbortController | undefined,
    writeController: AbortController | undefined,
    exportController: AbortController | undefined
  function clearEditor() {
    original.value = undefined
    editing.value = unknown.value = conflict.value = false
    Object.assign(form, { text: '', businessTerm: '', note: '', requirementUrl: '' })
    Object.assign(invalid, { text: '', businessTerm: '', note: '', requirementUrl: '' })
    pending = undefined
    notice.value = ''
  }
  function cancelExport() {
    exportController?.abort()
    exportController = undefined
    exporting.value = false
  }
  function clearPage() {
    generation++
    querySequence++
    readController?.abort()
    writeController?.abort()
    cancelExport()
    result.value = undefined
    loading.value = busy.value = false
    error.value = exportError.value = ''
    pageIndex.value = 0
    Object.assign(filters, { keyword: '', kind: '', requirement: '' })
    applied.value = {}
    clearEditor()
  }
  function rejectAccess(cause: unknown) {
    if (!(cause instanceof ApiError) || ![401, 403, 404].includes(cause.status)) return false
    clearPage()
    error.value = t('proto.copyUnavailable')
    return true
  }
  function checkSnapshot(value: CopyInventorySnapshot, selected: CopyInventoryTarget) {
    const current = authorized.value
    if (
      !current ||
      value.projectId !== current.project.id ||
      value.versionId !== selected.versionId ||
      value.revisionId !== selected.revisionId ||
      value.pageId !== selected.pageId ||
      value.pagePath !== page.value?.path ||
      value.manifestSha256 !== current.revision.manifestSha256 ||
      !['NOT_EXTRACTED', 'READY', 'EMPTY', 'LIMIT_EXCEEDED'].includes(value.extractionState) ||
      (value.configVersion !== null &&
        (!Number.isSafeInteger(value.configVersion) || value.configVersion < 0))
    )
      throw new ApiError(t('proto.copyUnavailable'), 404)
  }
  async function load() {
    const selected = target.value
    if (!selected || busy.value || exporting.value) return
    readController?.abort()
    const controller = new AbortController(),
      epoch = generation,
      sequence = ++querySequence
    readController = controller
    loading.value = true
    error.value = ''
    try {
      const value = await copyInventoryApi.query(
        selected,
        { ...applied.value, pageIndex: pageIndex.value, pageSize: 20 },
        { signal: controller.signal, silent: true },
      )
      if (epoch !== generation || sequence !== querySequence || controller.signal.aborted) return
      checkSnapshot(value.snapshot, selected)
      if (
        value.pageIndex !== pageIndex.value ||
        value.pageSize !== 20 ||
        !Number.isSafeInteger(value.total) ||
        value.total < 0
      )
        throw new ApiError(t('proto.copyUnavailable'), 404)
      result.value = value
    } catch (cause) {
      if (epoch !== generation || sequence !== querySequence || controller.signal.aborted) return
      if (!rejectAccess(cause)) error.value = t('proto.copyLoadFailed')
    } finally {
      if (epoch === generation && sequence === querySequence) loading.value = false
    }
  }
  async function loadPages() {
    const selected = authorized.value
    if (!selected) return
    const controller = new AbortController(),
      epoch = generation,
      sequence = ++pagesSequence
    pagesController = controller
    pagesLoading.value = true
    try {
      const values = await versionsApi.revisionPages(
        selected.revision.versionId,
        selected.revision.id,
        { signal: controller.signal, silent: true },
      )
      if (epoch !== generation || controller.signal.aborted) return
      const flatten = (items: PrototypePage[]): ReviewPage[] =>
        items.flatMap((item) => [
          ...(!item.folder && item.pageId && item.path
            ? [
                {
                  revisionId: selected.revision.id,
                  pageId: item.pageId,
                  name: item.name,
                  path: item.path,
                },
              ]
            : []),
          ...flatten(item.children || []),
        ])
      pages.value = flatten(values)
      const initial = selected.initialPage
      const exact =
        initial &&
        initial.revisionId === selected.revision.id &&
        pages.value.find((item) => item.pageId === initial.pageId && item.path === initial.path)
      if (initial && !exact) throw new ApiError(t('proto.copyUnavailable'), 404)
      pageId.value = (exact || pages.value[0])?.pageId || ''
      if (!pageId.value) error.value = t('proto.copyUnavailable')
    } catch (cause) {
      if (epoch !== generation || controller.signal.aborted) return
      if (!rejectAccess(cause)) error.value = t('proto.copyLoadFailed')
    } finally {
      if (sequence === pagesSequence) pagesLoading.value = false
    }
  }
  function edit(row?: CopyInventoryEntry) {
    if (!canEdit.value || !extracted.value || locked.value || loading.value) return
    clearEditor()
    original.value = row
    editing.value = true
    Object.assign(form, {
      text: row?.text || '',
      businessTerm: row?.businessTerm || '',
      note: row?.note || '',
      requirementUrl: row?.requirementUrl || '',
    })
  }
  async function write(operation: Operation) {
    const selected = target.value
    if (!selected || !canEdit.value || busy.value || exporting.value) return
    readController?.abort()
    querySequence++
    loading.value = false
    const epoch = generation,
      controller = new AbortController()
    writeController = controller
    pending = operation
    busy.value = true
    notice.value = ''
    try {
      const options = { signal: controller.signal, silent: true }
      if (operation.kind === 'extract')
        await copyInventoryApi.extract(selected, operation.input, options)
      else if (operation.kind === 'create')
        await copyInventoryApi.create(selected, operation.input, options)
      else if (operation.kind === 'update')
        await copyInventoryApi.update(selected, operation.id, operation.input, options)
      else await copyInventoryApi.remove(selected, operation.id, operation.input, options)
      if (epoch !== generation || controller.signal.aborted) return
      clearEditor()
      notice.value = t(
        operation.kind === 'extract'
          ? 'proto.copyExtracted'
          : operation.kind === 'delete'
            ? 'proto.copyDeleted'
            : 'proto.copySaved',
      )
      busy.value = false
      await load()
    } catch (cause) {
      if (epoch !== generation || controller.signal.aborted) return
      if (rejectAccess(cause)) return
      if (cause instanceof ApiError && operation.kind === 'extract' && cause.status === 422) {
        clearEditor()
        busy.value = false
        await load()
      } else if (cause instanceof ApiError && cause.status === 409) {
        pending = undefined
        unknown.value = false
        conflict.value = true
        notice.value = t('proto.copyConflict')
      } else if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        pending = undefined
        unknown.value = false
        notice.value = t('proto.copyWriteFailed')
      } else {
        unknown.value = true
        notice.value = t('proto.copyUnknown')
      }
    } finally {
      if (epoch === generation) busy.value = false
    }
  }
  function save() {
    if (!editing.value || !canEdit.value || locked.value || conflict.value) return
    const isManual = original.value?.kind !== 'STATIC'
    Object.assign(invalid, {
      text:
        isManual && (!form.text.trim() || form.text.length > 2000)
          ? t('proto.copyInvalidText')
          : '',
      businessTerm: form.businessTerm.length > 200 ? t('proto.copyInvalidTerm') : '',
      note: form.note.length > 2000 ? t('proto.copyInvalidNote') : '',
      requirementUrl:
        form.requirementUrl.trim() && !safeWorkItemUrl(form.requirementUrl.trim())
          ? t('proto.copyInvalidUrl')
          : '',
    })
    if (Object.values(invalid).some(Boolean)) return
    const input: CopyInventoryInput = {
      clientRequestId: secureId(),
      ...(isManual ? { text: form.text } : {}),
      businessTerm: form.businessTerm,
      note: form.note,
      requirementUrl: form.requirementUrl.trim(),
    }
    void write(
      original.value
        ? {
            kind: 'update',
            id: original.value.id,
            input: { ...input, expectedVersion: original.value.configVersion },
          }
        : { kind: 'create', input },
    )
  }
  function extract() {
    if (!locked.value && !extracted.value)
      void write({ kind: 'extract', input: { clientRequestId: secureId() } })
  }
  function remove(row: CopyInventoryEntry) {
    if (!locked.value && !editing.value && row.kind === 'MANUAL')
      void write({
        kind: 'delete',
        id: row.id,
        input: { clientRequestId: secureId(), expectedVersion: row.configVersion },
      })
  }
  function retry() {
    if (unknown.value && pending) void write(pending)
  }
  function discard() {
    if (!busy.value && !unknown.value) {
      clearEditor()
      void load()
    }
  }
  function query(clear = false) {
    if (locked.value || editing.value) return
    if (clear) Object.assign(filters, { keyword: '', kind: '', requirement: '' })
    applied.value = {
      keyword: filters.keyword.trim(),
      kind: filters.kind || undefined,
      hasRequirement: filters.requirement ? filters.requirement === 'yes' : undefined,
    }
    pageIndex.value = 0
    void load()
  }
  function selectPage(id: string) {
    if (!locked.value && pages.value.some((item) => item.pageId === id)) pageId.value = id
  }
  function paginate(value: number) {
    if (!locked.value && !editing.value) {
      pageIndex.value = value - 1
      void load()
    }
  }
  async function exportInventory(format: 'csv' | 'json') {
    const selected = target.value,
      version = snapshot.value?.configVersion
    if (!selected || version == null || !extracted.value || locked.value || editing.value) return
    cancelExport()
    const controller = new AbortController(),
      epoch = generation
    exportController = controller
    exporting.value = true
    exportError.value = ''
    try {
      const file = await copyInventoryApi.export(
        selected,
        { format, expectedVersion: version },
        { signal: controller.signal, silent: true },
      )
      if (epoch !== generation || controller.signal.aborted || !authorized.value) return
      await download(file)
    } catch (cause) {
      if (epoch !== generation || controller.signal.aborted) return
      if (rejectAccess(cause)) return
      exportError.value = t(
        cause instanceof ApiError && cause.status === 409
          ? 'proto.copyExportConflict'
          : cause instanceof ApiError && [413, 422].includes(cause.status)
            ? 'proto.copyExportTooLarge'
            : 'proto.copyExportFailed',
      )
    } finally {
      if (exportController === controller) {
        exportController = undefined
        exporting.value = false
      }
    }
  }
  watch(
    () =>
      JSON.stringify(
        authorized.value && [
          authorized.value.actorId,
          authorized.value.project.id,
          authorized.value.revision.id,
        ],
      ),
    () => {
      clearPage()
      pagesController?.abort()
      pages.value = []
      pageId.value = ''
      if (scope.value && !authorized.value) error.value = t('proto.copyUnavailable')
      void loadPages()
    },
    { immediate: true, flush: 'sync' },
  )
  watch(
    pageId,
    () => {
      clearPage()
      void load()
    },
    { flush: 'sync' },
  )
  watch(
    canEdit,
    (value) => {
      if (!value) {
        generation++
        querySequence++
        readController?.abort()
        writeController?.abort()
        loading.value = busy.value = false
        clearEditor()
        if (target.value) void load()
        else if (authorized.value) void loadPages()
      }
    },
    { flush: 'sync' },
  )
  onScopeDispose(() => {
    clearPage()
    pagesController?.abort()
  })
  return {
    pages,
    pageId,
    page,
    result,
    snapshot,
    extracted,
    canEdit,
    loading,
    pagesLoading,
    busy,
    exporting,
    locked,
    error,
    notice,
    exportError,
    unknown,
    conflict,
    editing,
    original,
    form,
    invalid,
    dirty,
    filters,
    filtered,
    pageIndex,
    load,
    loadPages,
    extract,
    edit,
    save,
    remove,
    retry,
    discard,
    query,
    selectPage,
    paginate,
    exportInventory,
    cancelExport,
  }
}
