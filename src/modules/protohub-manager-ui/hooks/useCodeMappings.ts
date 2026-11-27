import { computed, onScopeDispose, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import { usePermissions } from '@/shared/auth/provider'
import { token } from '@/shared/auth/token'
import { ApiError } from '@/shared/api/errors'
import { download } from '@/shared/api/client'
import type { PageResult } from '@/shared/api/types'
import { secureId } from '@/shared/utils/secure-id'
import { t } from '@/shared/i18n'
import { protoPermissions as p } from '../routes/permissions'
import { projectAllows } from '../utils/project-access'
import { flattenPages, stablePageId, selectablePage } from '../utils/preview-location'
import { codeMappingApi as api } from '../api/code-mapping'
import { functionalSpecApi } from '../api/functional-spec'
import {
  codeMappingDraft,
  codeMappingIssues,
  codeMappingFormat,
  codeMappingByteLimit,
  emptyCodeMapping,
  parseCodeMappingPackage,
  type CodeMappingIssue,
} from '../utils/code-mapping'
import type {
  CodeMappingScope,
  CodeMappingTarget,
  CodeMappingCard,
  CodeMappingCreate,
  CodeMappingUpdate,
  CodeMappingDelete,
  CodeMappingImport,
  CodeMappingImportResult,
  CodeMappingDraft,
  CodeMappingDescriptionRef,
} from '../types/code-mapping'
import type { FunctionalSpec } from '../types/functional-spec'

type Operation =
  | { kind: 'create'; input: CodeMappingCreate }
  | { kind: 'update'; id: string; input: CodeMappingUpdate }
  | { kind: 'delete'; id: string; input: CodeMappingDelete }
  | { kind: 'import'; input: CodeMappingImport }

/** The actor, credential and fixed page own every private draft, late response and exact retry. */
export function useCodeMappings(scope: Ref<CodeMappingScope | undefined>) {
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
  const pages = computed(() =>
    authorized.value
      ? flattenPages(authorized.value.context.pages).flatMap((item) => {
          const id = stablePageId(item, authorized.value!.context.pages)
          return id && selectablePage(item, authorized.value!.context.runtimeBaseUrl)
            ? [{ pageId: id, name: item.name, path: item.path! }]
            : []
        })
      : [],
  )
  const pageId = ref('')
  const page = computed(() => pages.value.find((item) => item.pageId === pageId.value))
  const target = computed<CodeMappingTarget | undefined>(() =>
    authorized.value && page.value
      ? {
          versionId: authorized.value.revision.versionId,
          revisionId: authorized.value.revision.id,
          pageId: pageId.value,
        }
      : undefined,
  )
  const rows = shallowRef<PageResult<CodeMappingCard>>()
  const selected = shallowRef<CodeMappingCard>()
  const selectedIds = ref<string[]>([])
  const pageIndex = ref(0),
    keyword = ref(''),
    appliedKeyword = ref('')
  const mode = ref<'browse' | 'edit' | 'import'>('browse')
  const form = reactive(emptyCodeMapping())
  const original = shallowRef<CodeMappingCard>(),
    serverRecord = shallowRef<CodeMappingCard>()
  const loading = ref(false),
    busy = ref(false),
    unknown = ref(false),
    conflict = ref(false)
  const sourceConflict = ref(false)
  const error = ref(''),
    notice = ref(''),
    baseline = ref('')
  const issues = ref<CodeMappingIssue[]>([])
  const importText = ref(''),
    importCards = ref<CodeMappingDraft[]>([])
  const importIssues = ref<CodeMappingIssue[]>([])
  const importResult = shallowRef<CodeMappingImportResult>()
  const fileReading = ref(false)
  const descriptionLabels = ref(new Map<string, string>())
  const descriptions = shallowRef<PageResult<FunctionalSpec>>()
  const descriptionDetail = shallowRef<FunctionalSpec>()
  const descriptionLoading = ref(false),
    descriptionIndex = ref(0),
    descriptionKeyword = ref('')
  const locked = computed(() => busy.value || unknown.value)
  const dirty = computed(() =>
    mode.value === 'edit'
      ? JSON.stringify(form) !== baseline.value
      : mode.value === 'import' &&
        !importResult.value &&
        (!!importText.value || !!importCards.value.length),
  )
  let generation = 0,
    listSequence = 0,
    sourceSequence = 0,
    fileSequence = 0,
    detailSequence = 0
  let credential = token.get()
  let reader: AbortController | undefined,
    writer: AbortController | undefined,
    sourceReader: AbortController | undefined,
    detailReader: AbortController | undefined
  let pending: Operation | undefined

  function clearEditor() {
    // A late read must never replace a newly entered editor or import preview.
    detailSequence++
    sourceSequence++
    detailReader?.abort()
    sourceReader?.abort()
    detailReader = sourceReader = undefined
    loading.value = descriptionLoading.value = false
    mode.value = 'browse'
    original.value = serverRecord.value = undefined
    descriptionDetail.value = undefined
    descriptionLabels.value.clear()
    issues.value = []
    Object.assign(form, emptyCodeMapping())
    baseline.value = JSON.stringify(form)
    importText.value = ''
    importCards.value = []
    importIssues.value = []
    importResult.value = undefined
    fileSequence++
    fileReading.value = false
    pending = undefined
    unknown.value = conflict.value = sourceConflict.value = false
  }
  function clear() {
    generation++
    listSequence++
    sourceSequence++
    detailSequence++
    reader?.abort()
    writer?.abort()
    sourceReader?.abort()
    detailReader?.abort()
    rows.value = selected.value = descriptions.value = undefined
    selectedIds.value = []
    pageId.value = ''
    pageIndex.value = descriptionIndex.value = 0
    keyword.value = appliedKeyword.value = descriptionKeyword.value = ''
    loading.value = busy.value = descriptionLoading.value = denied.value = false
    error.value = notice.value = ''
    clearEditor()
  }
  function current(epoch: number) {
    if (epoch !== generation) return false
    if (credential !== token.get()) {
      clear()
      denied.value = true
      error.value = t('proto.codeUnavailable')
      return false
    }
    return !!authorized.value && !denied.value
  }
  function checkCredential() {
    current(generation)
  }
  function deny(cause: unknown, scopeRead = false) {
    if (
      !(cause instanceof ApiError) ||
      ![401, 403, ...(scopeRead ? [404] : [])].includes(cause.status)
    )
      return false
    clear()
    denied.value = true
    error.value = t('proto.codeUnavailable')
    return true
  }
  function checkCard(value: CodeMappingCard, fixed: CodeMappingTarget) {
    const source = value?.description
    if (
      !value ||
      !value.id ||
      value.projectId !== authorized.value?.project.id ||
      value.versionId !== fixed.versionId ||
      value.revisionId !== fixed.revisionId ||
      value.pageId !== fixed.pageId ||
      !Number.isSafeInteger(value.configVersion) ||
      value.configVersion < 0 ||
      !Number.isFinite(value.createdAt) ||
      !Number.isFinite(value.updatedAt) ||
      codeMappingIssues(value).length ||
      (source !== null &&
        (!source ||
          typeof source.id !== 'string' ||
          !source.id ||
          !Number.isSafeInteger(source.expectedVersion) ||
          source.expectedVersion < 0 ||
          !['current', 'changed', 'missing'].includes(source.status) ||
          (source.status === 'missing'
            ? source.currentVersion !== null || source.title !== null
            : !Number.isSafeInteger(source.currentVersion) ||
              source.currentVersion! < 0 ||
              typeof source.title !== 'string')))
    )
      throw new ApiError(t('proto.codeUnavailable'), 404)
  }
  async function load() {
    const fixed = target.value
    if (!fixed || !current(generation) || busy.value) return
    reader?.abort()
    const controller = new AbortController(),
      epoch = generation,
      serial = ++listSequence
    reader = controller
    loading.value = true
    if (!unknown.value && !conflict.value) error.value = ''
    try {
      const value = await api.query(
        fixed,
        { keyword: appliedKeyword.value || undefined, pageIndex: pageIndex.value, pageSize: 20 },
        { signal: controller.signal, silent: true },
      )
      if (!current(epoch) || serial !== listSequence || controller.signal.aborted) return
      if (
        !Array.isArray(value.data) ||
        value.data.length > 20 ||
        !Number.isSafeInteger(value.total) ||
        value.total < 0
      )
        throw new ApiError(t('proto.codeLoadFailed'), 502)
      value.data.forEach((row) => checkCard(row, fixed))
      rows.value = value
      if (!value.data.length && value.total && pageIndex.value > 0) {
        pageIndex.value = Math.max(0, Math.ceil(value.total / 20) - 1)
        void load()
      }
    } catch (cause) {
      if (
        current(epoch) &&
        serial === listSequence &&
        !controller.signal.aborted &&
        !deny(cause, true)
      )
        error.value = t('proto.codeLoadFailed')
    } finally {
      if (current(epoch) && serial === listSequence) loading.value = false
    }
  }
  async function show(row: CodeMappingCard) {
    const fixed = target.value
    if (!fixed || locked.value || !current(generation)) return false
    detailReader?.abort()
    const controller = new AbortController(),
      epoch = generation,
      serial = ++detailSequence
    detailReader = controller
    loading.value = true
    try {
      const value = await api.get(fixed, row.id, { signal: controller.signal, silent: true })
      if (!current(epoch) || serial !== detailSequence || controller.signal.aborted) return false
      checkCard(value, fixed)
      clearEditor()
      selected.value = value
      error.value = ''
      return true
    } catch (cause) {
      if (current(epoch) && serial === detailSequence && !controller.signal.aborted && !deny(cause))
        error.value = t(
          cause instanceof ApiError && cause.status === 404
            ? 'proto.codeGone'
            : 'proto.codeLoadFailed',
        )
    } finally {
      if (current(epoch) && serial === detailSequence) loading.value = false
    }
    return false
  }
  function edit(row?: CodeMappingCard) {
    if (!canEdit.value || locked.value) return
    clearEditor()
    mode.value = 'edit'
    original.value = row
    Object.assign(form, row ? codeMappingDraft(row) : emptyCodeMapping())
    baseline.value = JSON.stringify(form)
    void loadDescriptions(0)
  }
  function startImport() {
    if (!canEdit.value || locked.value) return
    clearEditor()
    mode.value = 'import'
    void loadDescriptions(0)
  }
  function previewImport() {
    if (!canEdit.value || locked.value) return
    fileSequence++
    const parsed = parseCodeMappingPackage(importText.value)
    importCards.value = parsed.value?.cards.map((card) => ({ ...card, description: null })) || []
    importIssues.value = parsed.issues
    importResult.value = undefined
  }
  function updateImportText(value: string) {
    if (locked.value || !canEdit.value) return
    fileSequence++
    fileReading.value = false
    importText.value = value
    importCards.value = []
    importIssues.value = []
    importResult.value = undefined
  }
  async function readFile(file?: File) {
    if (!file || locked.value || !canEdit.value) return
    const serial = ++fileSequence,
      epoch = generation
    importCards.value = []
    importResult.value = undefined
    importIssues.value = []
    if (!file.size || file.size > codeMappingByteLimit) {
      importText.value = ''
      importIssues.value = [{ reason: 'size' }]
      return
    }
    fileReading.value = true
    try {
      const text = await file.text()
      if (!current(epoch) || serial !== fileSequence || mode.value !== 'import' || locked.value)
        return
      fileReading.value = false
      importText.value = text
      previewImport()
    } catch {
      if (current(epoch) && serial === fileSequence) importIssues.value = [{ reason: 'json' }]
    } finally {
      if (current(epoch) && serial === fileSequence) fileReading.value = false
    }
  }
  async function loadDescriptions(index = descriptionIndex.value) {
    const fixed = target.value
    if (!fixed || !current(generation) || locked.value) return
    sourceReader?.abort()
    const controller = new AbortController(),
      epoch = generation,
      serial = ++sourceSequence
    sourceReader = controller
    descriptionLoading.value = true
    descriptionIndex.value = index
    try {
      const value = await functionalSpecApi.query(
        fixed,
        { keyword: descriptionKeyword.value || undefined, pageIndex: index, pageSize: 20 },
        { signal: controller.signal, silent: true },
      )
      if (!current(epoch) || serial !== sourceSequence || controller.signal.aborted) return
      value.data.forEach((row) => {
        if (
          row.projectId !== authorized.value?.project.id ||
          row.versionId !== fixed.versionId ||
          row.revisionId !== fixed.revisionId ||
          row.pageId !== fixed.pageId ||
          !row.id ||
          !Number.isSafeInteger(row.configVersion) ||
          row.configVersion < 0
        )
          throw new ApiError(t('proto.codeUnavailable'), 404)
      })
      descriptions.value = value
    } catch (cause) {
      if (current(epoch) && serial === sourceSequence && !controller.signal.aborted && !deny(cause))
        error.value = t('proto.codeSourceLoadFailed')
    } finally {
      if (current(epoch) && serial === sourceSequence) descriptionLoading.value = false
    }
  }
  function rememberDescription(id: string, title: string) {
    descriptionLabels.value.set(id, title)
    const selected = new Set(
      [form.description, ...importCards.value.map((card) => card.description)].flatMap((ref) =>
        ref ? [ref.id] : [],
      ),
    )
    for (const key of descriptionLabels.value.keys())
      if (!selected.has(key)) descriptionLabels.value.delete(key)
  }
  function chooseDescription(id: string | undefined, index?: number) {
    if (!canEdit.value || locked.value || conflict.value) return
    const candidate = descriptions.value?.data.find((row) => row.id === id)
    if (id && !candidate) return
    const ref = candidate ? { id: candidate.id, expectedVersion: candidate.configVersion } : null
    if (index !== undefined) {
      const card = importCards.value[index]
      if (card) card.description = ref
    } else form.description = ref
    if (candidate) rememberDescription(candidate.id, candidate.title)
    sourceSequence++
    sourceReader?.abort()
    descriptionLoading.value = false
    descriptionDetail.value = undefined
  }
  async function readDescription(ref?: CodeMappingDescriptionRef | null) {
    const fixed = target.value,
      source = ref || selected.value?.description
    if (!fixed || !source || !current(generation) || busy.value) return false
    sourceReader?.abort()
    const controller = new AbortController(),
      epoch = generation,
      serial = ++sourceSequence
    sourceReader = controller
    descriptionLoading.value = true
    descriptionDetail.value = undefined
    try {
      const value = await functionalSpecApi.get(fixed, source.id, {
        signal: controller.signal,
        silent: true,
      })
      if (!current(epoch) || serial !== sourceSequence || controller.signal.aborted) return false
      if (
        value.id !== source.id ||
        value.projectId !== authorized.value?.project.id ||
        value.versionId !== fixed.versionId ||
        value.revisionId !== fixed.revisionId ||
        value.pageId !== fixed.pageId ||
        !Number.isSafeInteger(value.configVersion) ||
        value.configVersion < 0
      )
        throw new ApiError(t('proto.codeUnavailable'), 404)
      descriptionDetail.value = value
      return true
    } catch (cause) {
      if (current(epoch) && serial === sourceSequence && !controller.signal.aborted && !deny(cause))
        error.value = t(
          cause instanceof ApiError && cause.status === 404
            ? 'proto.codeSourceMissing'
            : 'proto.codeSourceLoadFailed',
        )
    } finally {
      if (current(epoch) && serial === sourceSequence) descriptionLoading.value = false
    }
    return false
  }
  function useCurrentDescription() {
    const value = descriptionDetail.value
    if (!value || !canEdit.value || locked.value || conflict.value) return
    if (mode.value !== 'edit') {
      const row = selected.value
      if (!row) return
      edit(row)
    }
    form.description = { id: value.id, expectedVersion: value.configVersion }
    rememberDescription(value.id, value.title)
    descriptionDetail.value = value
  }
  async function execute(operation: Operation) {
    const fixed = target.value
    if (!fixed || !canEdit.value || busy.value || !current(generation)) return
    const epoch = generation,
      controller = new AbortController()
    writer = controller
    pending = operation
    busy.value = true
    unknown.value = false
    error.value = notice.value = ''
    sourceConflict.value = false
    const options = { signal: controller.signal, silent: true }
    try {
      const value =
        operation.kind === 'create'
          ? await api.create(fixed, operation.input, options)
          : operation.kind === 'update'
            ? await api.update(fixed, operation.id, operation.input, options)
            : operation.kind === 'delete'
              ? await api.remove(fixed, operation.id, operation.input, options)
              : await api.import(fixed, operation.input, options)
      if (!current(epoch) || controller.signal.aborted || !canEdit.value) return
      if (operation.kind === 'import') {
        const result = value as CodeMappingImportResult
        if (
          !Array.isArray(result.items) ||
          result.items.length !== operation.input.cards.length ||
          new Set(result.items.map((item) => item.id)).size !== result.items.length
        )
          throw new ApiError(t('proto.codeUnknown'), 502)
        result.items.forEach((item) => {
          if (
            !item.id ||
            (item.status === 'missing'
              ? item.card !== null
              : item.status !== 'current' || !item.card)
          )
            throw new ApiError(t('proto.codeUnknown'), 502)
          if (item.card) {
            checkCard(item.card, fixed)
            if (item.card.id !== item.id) throw new ApiError(t('proto.codeUnknown'), 502)
          }
        })
        importResult.value = result
        pending = undefined
        unknown.value = conflict.value = false
        notice.value = t('proto.codeImported')
      } else {
        if (operation.kind === 'delete') {
          if (value !== true) throw new ApiError(t('proto.codeUnknown'), 502)
          selectedIds.value = selectedIds.value.filter((id) => id !== operation.id)
          if (selected.value?.id === operation.id) selected.value = undefined
        } else {
          checkCard(value as CodeMappingCard, fixed)
          selected.value = value as CodeMappingCard
        }
        clearEditor()
        notice.value = t(operation.kind === 'delete' ? 'proto.codeRemoved' : 'proto.codeSaved')
      }
    } catch (cause) {
      if (!current(epoch) || controller.signal.aborted || deny(cause)) return
      if (cause instanceof ApiError && [404, 409].includes(cause.status)) {
        conflict.value = true
        sourceConflict.value = !!cause.code?.includes('DESCRIPTION')
        unknown.value = false
        error.value = t(
          cause.code?.includes('IDEMPOTENCY')
            ? 'proto.codeRequestConflict'
            : sourceConflict.value
              ? 'proto.codeSourceConflict'
              : cause.status === 404
                ? 'proto.codeGone'
                : 'proto.codeConflict',
        )
      } else if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        ![408, 429].includes(cause.status)
      ) {
        pending = undefined
        unknown.value = false
        error.value = t(cause.status === 413 ? 'proto.codePackageSize' : 'proto.codeRejected')
      } else {
        unknown.value = true
        error.value = t('proto.codeUnknown')
      }
    } finally {
      if (current(epoch)) {
        busy.value = false
        if (!unknown.value && !denied.value) void load()
      }
    }
  }
  function save() {
    if (!canEdit.value || locked.value || conflict.value || mode.value !== 'edit') return
    issues.value = codeMappingIssues(form)
    if (issues.value.length) return
    const input = { ...codeMappingDraft(form), clientRequestId: secureId() }
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
  function importAll() {
    if (
      !canEdit.value ||
      locked.value ||
      conflict.value ||
      importResult.value ||
      !importCards.value.length ||
      importIssues.value.length ||
      fileReading.value
    )
      return
    void execute({
      kind: 'import',
      input: {
        format: codeMappingFormat,
        schemaVersion: 1,
        cards: importCards.value.map(codeMappingDraft),
        clientRequestId: secureId(),
      },
    })
  }
  function remove(row: CodeMappingCard) {
    if (!canEdit.value || locked.value || conflict.value) return
    original.value = row
    void execute({
      kind: 'delete',
      id: row.id,
      input: { expectedVersion: row.configVersion, clientRequestId: secureId() },
    })
  }
  async function readCurrent() {
    const fixed = target.value,
      operation = pending
    if (!fixed || !operation || !('id' in operation) || !conflict.value || locked.value) return
    const epoch = generation
    loading.value = true
    try {
      const value = await api.get(fixed, operation.id, { silent: true })
      if (!current(epoch) || !conflict.value || pending !== operation) return
      checkCard(value, fixed)
      serverRecord.value = value
    } catch (cause) {
      if (current(epoch) && pending === operation && !deny(cause))
        error.value = t(
          cause instanceof ApiError && cause.status === 404
            ? 'proto.codeGone'
            : 'proto.codeLoadFailed',
        )
    } finally {
      if (current(epoch) && pending === operation) loading.value = false
    }
  }
  function resolveConflict(keepDraft: boolean) {
    const row = serverRecord.value
    if (!row || locked.value) return
    if (keepDraft && mode.value === 'edit') {
      original.value = row
      serverRecord.value = undefined
      conflict.value = false
      pending = undefined
    } else {
      edit(row)
      selected.value = row
    }
    error.value = ''
  }
  function reviseRejected() {
    if (
      locked.value ||
      !conflict.value ||
      !sourceConflict.value ||
      pending?.kind === 'delete' ||
      pending?.kind === 'update'
    )
      return
    pending = undefined
    conflict.value = sourceConflict.value = false
    error.value = ''
    if (mode.value === 'import') void loadDescriptions(0)
  }
  function toggleSelection(id: string, checked: boolean) {
    if (locked.value) return
    selectedIds.value = checked
      ? [...new Set([...selectedIds.value, id])].slice(0, 50)
      : selectedIds.value.filter((value) => value !== id)
  }
  async function exportSelected() {
    const fixed = target.value
    if (!fixed || locked.value || !selectedIds.value.length || !current(generation)) return
    const epoch = generation,
      controller = new AbortController()
    reader = controller
    loading.value = true
    error.value = ''
    try {
      const value = await api.export(fixed, [...selectedIds.value], {
        signal: controller.signal,
        silent: true,
      })
      if (!current(epoch) || controller.signal.aborted) return
      if (
        value.blob.size > codeMappingByteLimit ||
        !value.contentType.toLowerCase().includes('application/json')
      )
        throw new ApiError(t('proto.codeRejected'), 502)
      await download({ ...value, filename: 'code-mapping-cards.json' })
    } catch (cause) {
      if (current(epoch) && !controller.signal.aborted && !deny(cause))
        error.value = t(
          cause instanceof ApiError && cause.status === 413
            ? 'proto.codePackageSize'
            : 'proto.codeExportFailed',
        )
    } finally {
      if (current(epoch)) loading.value = false
    }
  }
  function selectPage(id: string) {
    if (locked.value || !pages.value.some((row) => row.pageId === id)) return
    clear()
    pageId.value = id
    void load()
  }
  function query(index = 0) {
    if (locked.value || keyword.value.length > 120 || keyword.value.includes('\0')) return
    pageIndex.value = index
    appliedKeyword.value = keyword.value
    void load()
  }
  watch(
    () =>
      JSON.stringify(
        authorized.value && [
          authorized.value.actorId,
          authorized.value.project.id,
          authorized.value.revision.versionId,
          authorized.value.revision.id,
          authorized.value.context.runtimeBaseUrl,
          projectAllows(authorized.value.project, 'edit') && permissions.can(p.version.save),
        ],
      ),
    () => {
      clear()
      credential = token.get()
      pageId.value =
        pages.value.find((row) => row.pageId === scope.value?.initialPage?.pageId)?.pageId ||
        pages.value[0]?.pageId ||
        ''
      if (page.value) void load()
    },
    { immediate: true, flush: 'sync' },
  )
  window.addEventListener('storage', checkCredential)
  window.addEventListener('focus', checkCredential)
  onScopeDispose(() => {
    clear()
    window.removeEventListener('storage', checkCredential)
    window.removeEventListener('focus', checkCredential)
  })
  return {
    pages,
    page,
    pageId,
    target,
    canEdit,
    denied,
    sourceConflict,
    rows,
    selected,
    selectedIds,
    pageIndex,
    keyword,
    appliedKeyword,
    mode,
    form,
    original,
    serverRecord,
    loading,
    busy,
    unknown,
    conflict,
    locked,
    error,
    notice,
    issues,
    dirty,
    importText,
    importCards,
    importIssues,
    importResult,
    fileReading,
    descriptions,
    descriptionLabels,
    descriptionDetail,
    descriptionLoading,
    descriptionIndex,
    descriptionKeyword,
    clearEditor,
    load,
    show,
    edit,
    startImport,
    previewImport,
    updateImportText,
    readFile,
    loadDescriptions,
    chooseDescription,
    readDescription,
    useCurrentDescription,
    save,
    importAll,
    remove,
    readCurrent,
    resolveConflict,
    reviseRejected,
    toggleSelection,
    exportSelected,
    selectPage,
    query,
    retry: () => {
      if (unknown.value && pending) void execute(pending)
    },
  }
}
