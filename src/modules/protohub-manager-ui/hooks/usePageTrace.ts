import { computed, onScopeDispose, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import { usePermissions } from '@/shared/auth/provider'
import { token } from '@/shared/auth/token'
import { ApiError } from '@/shared/api/errors'
import type { PageResult } from '@/shared/api/types'
import { secureId } from '@/shared/utils/secure-id'
import { t } from '@/shared/i18n'
import { protoPermissions as p } from '../routes/permissions'
import { projectAllows } from '../utils/project-access'
import { flattenPages, stablePageId, selectablePage } from '../utils/preview-location'
import { demoText } from '../utils/demo-script'
import { pageTraceApi as api } from '../api/page-trace'
import { traceSourceKinds } from '../types/page-trace'
import type {
  TraceScope,
  TraceTarget,
  PageRelation,
  PageRelationDraft,
  TraceDecision,
  TraceDecisionDraft,
  TraceContext,
  TraceContextDraft,
  TraceSourceKind,
  TraceSourceCandidate,
  TraceSourceDetail,
  TraceSourceRef,
  ResolvedTraceSource,
  TraceDelete,
  TraceEntry,
} from '../types/page-trace'
type Operation =
  | {
      kind: 'relation'
      id?: string
      input: PageRelationDraft & { clientRequestId: string; expectedVersion?: number }
    }
  | {
      kind: 'decision'
      id?: string
      input: TraceDecisionDraft & { clientRequestId: string; expectedVersion?: number }
    }
  | { kind: 'delete-relation' | 'delete-decision'; id: string; input: TraceDelete }
  | { kind: 'context'; input: TraceContextDraft & TraceDelete }
const relationBlank = (): PageRelationDraft => ({
  fromPageId: '',
  toPageId: '',
  label: '',
  note: '',
})
const decisionBlank = (): TraceDecisionDraft => ({ title: '', decision: '', rationale: '' })
/** Private drafts and exact retry payloads never leave their actor and immutable revision scope. */
export function usePageTrace(scope: Ref<TraceScope | undefined>) {
  const permissions = usePermissions()
  const authorized = computed(() => {
    const value = scope.value
    return value?.actorId &&
      value.project.id === value.revision.projectId &&
      value.revision.id === value.context.revisionId &&
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
  const target = computed<TraceTarget | undefined>(
    () =>
      authorized.value && {
        versionId: authorized.value.revision.versionId,
        revisionId: authorized.value.revision.id,
      },
  )
  const pages = computed(() =>
    authorized.value
      ? flattenPages(authorized.value.context.pages).flatMap((page) => {
          const id = stablePageId(page, authorized.value!.context.pages)
          return id &&
            id.length <= 128 &&
            selectablePage(page, authorized.value!.context.runtimeBaseUrl)
            ? [{ pageId: id, name: page.name, path: page.path! }]
            : []
        })
      : [],
  )
  const pageId = ref('')
  const page = computed(() => pages.value.find((row) => row.pageId === pageId.value))
  const relations = shallowRef<PageResult<PageRelation>>()
  const decisions = shallowRef<PageResult<TraceDecision>>()
  const context = shallowRef<TraceContext>()
  const entries = shallowRef<PageResult<TraceEntry>>()
  const sourceCandidates = shallowRef<PageResult<TraceSourceCandidate>>()
  const sourceDetail = shallowRef<TraceSourceDetail>()
  const sourceKind = ref<TraceSourceKind>('work-item'),
    sourceId = ref(''),
    sourceIndex = ref(0)
  const entryIndex = ref(0),
    relationIndex = ref(0),
    decisionIndex = ref(0)
  const direction = ref<'all' | 'incoming' | 'outgoing'>('all'),
    keyword = ref(''),
    appliedKeyword = ref('')
  const relationForm = reactive(relationBlank()),
    decisionForm = reactive(decisionBlank())
  const mode = ref<'list' | 'relation' | 'decision' | 'source'>('list')
  const original = shallowRef<PageRelation | TraceDecision>()
  const serverRecord = shallowRef<PageRelation | TraceDecision | TraceContext>()
  const loading = ref(false),
    busy = ref(false),
    unknown = ref(false),
    conflict = ref(false),
    sourceLoading = ref(false)
  const error = ref(''),
    notice = ref(''),
    invalid = ref('')
  const baseline = ref('')
  const draft = () =>
    JSON.stringify(
      mode.value === 'relation'
        ? relationForm
        : mode.value === 'decision'
          ? decisionForm
          : [sourceKind.value, sourceId.value],
    )
  const dirty = computed(() => mode.value !== 'list' && draft() !== baseline.value)
  const locked = computed(() => busy.value || unknown.value)
  let generation = 0,
    sequence = 0,
    sourceSequence = 0,
    credential = token.get()
  let reader: AbortController | undefined,
    writer: AbortController | undefined,
    sourceReader: AbortController | undefined
  let pending: Operation | undefined
  function clearEditor() {
    mode.value = 'list'
    original.value = serverRecord.value = undefined
    pending = undefined
    unknown.value = conflict.value = false
    invalid.value = ''
    Object.assign(relationForm, relationBlank())
    Object.assign(decisionForm, decisionBlank())
    sourceId.value = ''
    sourceDetail.value = undefined
    baseline.value = draft()
  }
  function clear() {
    generation++
    sequence++
    sourceSequence++
    reader?.abort()
    writer?.abort()
    sourceReader?.abort()
    relations.value =
      decisions.value =
      context.value =
      entries.value =
      sourceCandidates.value =
        undefined
    loading.value = busy.value = sourceLoading.value = denied.value = false
    error.value = notice.value = ''
    pageId.value = ''
    relationIndex.value = decisionIndex.value = sourceIndex.value = entryIndex.value = 0
    clearEditor()
  }
  function current(epoch: number) {
    if (epoch !== generation) return false
    if (credential !== token.get()) {
      clear()
      denied.value = true
      error.value = t('proto.traceUnavailable')
      return false
    }
    return true
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
    error.value = t('proto.traceUnavailable')
    return true
  }
  function identity(
    row: { projectId: string; versionId: string; revisionId: string; configVersion: number },
    selected: TraceTarget,
    allowUnsaved = false,
  ) {
    if (
      !row ||
      row.projectId !== authorized.value?.project.id ||
      row.versionId !== selected.versionId ||
      row.revisionId !== selected.revisionId ||
      !Number.isSafeInteger(row.configVersion) ||
      row.configVersion < (allowUnsaved ? -1 : 0)
    )
      throw new ApiError(t('proto.traceUnavailable'), 404)
  }
  function checkRelation(row: PageRelation, selected: TraceTarget) {
    identity(row, selected)
    if (
      !row.id ||
      !pages.value.some((p) => p.pageId === row.fromPageId) ||
      !pages.value.some((p) => p.pageId === row.toPageId) ||
      row.fromPageId === row.toPageId ||
      !demoText(row.label, 120, true) ||
      !demoText(row.note, 2000)
    )
      throw new ApiError(t('proto.traceUnavailable'), 404)
  }
  function checkDecision(row: TraceDecision, selected: TraceTarget, selectedPage: string) {
    identity(row, selected)
    if (
      !row.id ||
      row.pageId !== selectedPage ||
      !demoText(row.title, 120, true) ||
      !demoText(row.decision, 2000, true) ||
      !demoText(row.rationale, 2000, true)
    )
      throw new ApiError(t('proto.traceUnavailable'), 404)
  }
  function checkContext(row: TraceContext, selected: TraceTarget, selectedPage: string) {
    identity(row, selected, true)
    if (
      row.pageId !== selectedPage ||
      typeof row.entry !== 'boolean' ||
      !Array.isArray(row.references) ||
      row.references.length > 40 ||
      row.references.some(
        (ref) =>
          !traceSourceKinds.includes(ref.kind) ||
          !ref.id ||
          !Number.isSafeInteger(ref.expectedVersion) ||
          ref.expectedVersion < 0 ||
          !['current', 'changed', 'missing'].includes(ref.status),
      )
    )
      throw new ApiError(t('proto.traceUnavailable'), 404)
  }
  async function load() {
    const selected = target.value,
      selectedPage = pageId.value
    if (!current(generation) || !selected || !page.value || busy.value || denied.value) return
    reader?.abort()
    const controller = new AbortController(),
      epoch = generation,
      serial = ++sequence
    reader = controller
    loading.value = true
    if (!unknown.value && !conflict.value) error.value = ''
    const options = { signal: controller.signal, silent: true }
    try {
      const [r, c, d, e] = await Promise.all([
        api.relations(
          selected,
          {
            pageId: selectedPage,
            direction: direction.value,
            keyword: appliedKeyword.value || undefined,
            pageIndex: relationIndex.value,
            pageSize: 20,
          },
          options,
        ),
        api.context(selected, selectedPage, options),
        api.decisions(
          selected,
          selectedPage,
          { pageIndex: decisionIndex.value, pageSize: 20 },
          options,
        ),
        api.entries(selected, { pageIndex: entryIndex.value, pageSize: 20 }, options),
      ])
      if (!current(epoch) || serial !== sequence || controller.signal.aborted) return
      r.data.forEach((row) => checkRelation(row, selected))
      checkContext(c, selected, selectedPage)
      d.data.forEach((row) => checkDecision(row, selected, selectedPage))
      relations.value = r
      context.value = c
      decisions.value = d
      entries.value = e
      if (r.total && !r.data.length && relationIndex.value) {
        relationIndex.value--
        void load()
      } else if (d.total && !d.data.length && decisionIndex.value) {
        decisionIndex.value--
        void load()
      } else if (!e.data.length && entryIndex.value) {
        entryIndex.value = Math.max(0, Math.ceil(e.total / 20) - 1)
        void load()
      }
    } catch (cause) {
      if (!current(epoch) || serial !== sequence || controller.signal.aborted) return
      if (!deny(cause, true)) error.value = t('proto.traceLoadFailed')
    } finally {
      if (serial === sequence) loading.value = false
    }
  }
  async function loadSources() {
    const selected = target.value,
      selectedPage = pageId.value,
      kind = sourceKind.value
    if (!selected || !page.value || denied.value || locked.value) return
    sourceReader?.abort()
    const controller = new AbortController(),
      epoch = generation,
      serial = ++sourceSequence
    sourceReader = controller
    sourceLoading.value = true
    sourceDetail.value = undefined
    try {
      const result = await api.sources(
        selected,
        selectedPage,
        { kind, pageIndex: sourceIndex.value, pageSize: 20 },
        { signal: controller.signal, silent: true },
      )
      if (!current(epoch) || serial !== sourceSequence || controller.signal.aborted) return
      if (
        result.data.some(
          (row) =>
            row.kind !== kind ||
            !row.id ||
            !Number.isSafeInteger(row.configVersion) ||
            row.configVersion < 0 ||
            typeof row.title !== 'string',
        )
      )
        throw new ApiError(t('proto.traceUnavailable'), 404)
      sourceCandidates.value = result
    } catch (cause) {
      if (!current(epoch) || serial !== sourceSequence || controller.signal.aborted) return
      if (!deny(cause)) error.value = t('proto.traceLoadFailed')
    } finally {
      if (serial === sourceSequence) sourceLoading.value = false
    }
  }
  async function readSource(ref: Pick<TraceSourceRef, 'kind' | 'id'>) {
    const selected = target.value,
      selectedPage = pageId.value
    if (!selected || !page.value || denied.value || locked.value) return
    sourceReader?.abort()
    const controller = new AbortController(),
      epoch = generation,
      serial = ++sourceSequence
    sourceReader = controller
    sourceLoading.value = true
    sourceDetail.value = undefined
    try {
      const result = await api.source(selected, selectedPage, ref.kind, ref.id, {
        signal: controller.signal,
        silent: true,
      })
      if (!current(epoch) || serial !== sourceSequence || controller.signal.aborted) return
      if (
        result.id !== ref.id ||
        result.kind !== ref.kind ||
        !Number.isSafeInteger(result.configVersion) ||
        result.configVersion < 0 ||
        typeof result.title !== 'string' ||
        !result.fields ||
        Object.values(result.fields).some((value) => typeof value !== 'string')
      )
        throw new ApiError(t('proto.traceUnavailable'), 404)
      sourceDetail.value = result
    } catch (cause) {
      if (!current(epoch) || serial !== sourceSequence || controller.signal.aborted) return
      if (cause instanceof ApiError && cause.status === 404) {
        error.value = t('proto.traceMissingHint')
        void load()
      } else if (!deny(cause)) error.value = t('proto.traceLoadFailed')
    } finally {
      if (serial === sourceSequence) sourceLoading.value = false
    }
  }
  async function execute(operation: Operation) {
    const selected = target.value,
      selectedPage = pageId.value
    if (!current(generation) || !selected || !page.value || !canEdit.value || busy.value) return
    reader?.abort()
    sequence++
    loading.value = false
    const controller = new AbortController(),
      epoch = generation
    writer = controller
    pending = operation
    busy.value = true
    error.value = notice.value = ''
    try {
      const options = { signal: controller.signal, silent: true }
      const value =
        operation.kind === 'context'
          ? await api.saveContext(selected, selectedPage, operation.input, options)
          : operation.kind === 'relation'
            ? operation.id
              ? await api.updateRelation(
                  selected,
                  operation.id,
                  operation.input as PageRelationDraft & TraceDelete,
                  options,
                )
              : await api.createRelation(selected, operation.input, options)
            : operation.kind === 'decision'
              ? operation.id
                ? await api.updateDecision(
                    selected,
                    selectedPage,
                    operation.id,
                    operation.input as TraceDecisionDraft & TraceDelete,
                    options,
                  )
                : await api.createDecision(selected, selectedPage, operation.input, options)
              : operation.kind === 'delete-relation'
                ? await api.removeRelation(selected, operation.id, operation.input, options)
                : await api.removeDecision(
                    selected,
                    selectedPage,
                    operation.id,
                    operation.input,
                    options,
                  )
      if (!current(epoch) || controller.signal.aborted || !canEdit.value) return
      if (operation.kind === 'context') checkContext(value as TraceContext, selected, selectedPage)
      else if (operation.kind === 'relation') checkRelation(value as PageRelation, selected)
      else if (operation.kind === 'decision')
        checkDecision(value as TraceDecision, selected, selectedPage)
      else if (value !== true) throw new ApiError(t('proto.traceUnknown'), 502)
      clearEditor()
      notice.value = t(
        operation.kind.startsWith('delete') ? 'proto.traceRemoved' : 'proto.traceSaved',
      )
    } catch (cause) {
      if (!current(epoch) || controller.signal.aborted) return
      if (deny(cause)) return
      // A removed record/source must not erase the editor's unsaved text. Scope reload still rechecks access.
      if (cause instanceof ApiError && cause.status === 404) {
        conflict.value = true
        unknown.value = false
        error.value = t('proto.traceRecordGone')
        return
      }
      if (cause instanceof ApiError && cause.status === 409) {
        conflict.value = true
        unknown.value = false
        error.value = t('proto.traceConflict')
      } else if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        ![408, 429].includes(cause.status)
      ) {
        pending = undefined
        unknown.value = false
        error.value = t('proto.traceRejected')
      } else {
        unknown.value = true
        error.value = t('proto.traceUnknown')
      }
    } finally {
      if (current(epoch)) {
        busy.value = false
        if (!unknown.value && !denied.value) void load()
      }
    }
  }
  function editRelation(row?: PageRelation) {
    if (!canEdit.value || locked.value) return
    clearEditor()
    original.value = row
    mode.value = 'relation'
    Object.assign(
      relationForm,
      row
        ? { fromPageId: row.fromPageId, toPageId: row.toPageId, label: row.label, note: row.note }
        : { ...relationBlank(), fromPageId: pageId.value },
    )
    baseline.value = draft()
  }
  function editDecision(row?: TraceDecision) {
    if (!canEdit.value || locked.value) return
    clearEditor()
    original.value = row
    mode.value = 'decision'
    Object.assign(
      decisionForm,
      row
        ? { title: row.title, decision: row.decision, rationale: row.rationale }
        : decisionBlank(),
    )
    baseline.value = draft()
  }
  function addSource() {
    if (!canEdit.value || locked.value) return
    clearEditor()
    mode.value = 'source'
    sourceIndex.value = 0
    baseline.value = draft()
    void loadSources()
  }
  function save() {
    if (!canEdit.value || locked.value || conflict.value) return
    const key = secureId(),
      version = original.value?.configVersion
    if (mode.value === 'relation') {
      const form = relationForm
      if (
        !pages.value.some((p) => p.pageId === form.fromPageId) ||
        !pages.value.some((p) => p.pageId === form.toPageId) ||
        form.fromPageId === form.toPageId ||
        !demoText(form.label, 120, true) ||
        !demoText(form.note, 2000)
      ) {
        invalid.value = t('proto.traceInvalid')
        return
      }
      void execute({
        kind: 'relation',
        id: original.value?.id,
        input: {
          ...form,
          label: form.label.trim(),
          clientRequestId: key,
          ...(version === undefined ? {} : { expectedVersion: version }),
        },
      })
    } else if (mode.value === 'decision') {
      if (
        !demoText(decisionForm.title, 120, true) ||
        !demoText(decisionForm.decision, 2000, true) ||
        !demoText(decisionForm.rationale, 2000, true)
      ) {
        invalid.value = t('proto.traceInvalid')
        return
      }
      void execute({
        kind: 'decision',
        id: original.value?.id,
        input: {
          ...decisionForm,
          title: decisionForm.title.trim(),
          clientRequestId: key,
          ...(version === undefined ? {} : { expectedVersion: version }),
        },
      })
    } else if (mode.value === 'source') {
      const candidate = sourceCandidates.value?.data.find(
        (row) => row.id === sourceId.value && row.kind === sourceKind.value,
      )
      if (!candidate || !context.value || context.value.references.length >= 40) {
        invalid.value = t('proto.traceInvalid')
        return
      }
      updateReferences([
        ...refs(),
        { kind: candidate.kind, id: candidate.id, expectedVersion: candidate.configVersion },
      ])
    }
  }
  const refs = (): TraceSourceRef[] =>
    context.value?.references.map(({ kind, id, expectedVersion }) => ({
      kind,
      id,
      expectedVersion,
    })) || []
  function updateReferences(references: TraceSourceRef[], entry = context.value?.entry || false) {
    if (!context.value || !canEdit.value || locked.value || conflict.value) return
    if (new Set(references.map((r) => `${r.kind}/${r.id}`)).size !== references.length) {
      invalid.value = t('proto.traceInvalid')
      return
    }
    void execute({
      kind: 'context',
      input: {
        entry,
        references,
        expectedVersion: context.value.configVersion,
        clientRequestId: secureId(),
      },
    })
  }
  function removeSource(ref: TraceSourceRef) {
    updateReferences(refs().filter((row) => row.id !== ref.id || row.kind !== ref.kind))
  }
  function reconnect(ref: ResolvedTraceSource) {
    const detail = sourceDetail.value
    if (!detail || detail.kind !== ref.kind || detail.id !== ref.id) return
    updateReferences(
      refs().map((row) =>
        row.kind === ref.kind && row.id === ref.id
          ? { ...row, expectedVersion: detail.configVersion }
          : row,
      ),
    )
  }
  function remove(row: PageRelation | TraceDecision, kind: 'relation' | 'decision') {
    if (!canEdit.value || locked.value || conflict.value) return
    original.value = row
    void execute({
      kind: kind === 'relation' ? 'delete-relation' : 'delete-decision',
      id: row.id,
      input: { expectedVersion: row.configVersion, clientRequestId: secureId() },
    })
  }
  async function readCurrent() {
    const selected = target.value,
      operation = pending,
      selectedPage = pageId.value
    if (!selected || !operation || !conflict.value || locked.value) return
    const epoch = generation
    loading.value = true
    try {
      const value =
        operation.kind === 'context'
          ? await api.context(selected, selectedPage)
          : operation.kind.includes('relation') && operation.id
            ? await api.relation(selected, operation.id)
            : operation.id
              ? await api.decision(selected, selectedPage, operation.id)
              : undefined
      if (!current(epoch) || pageId.value !== selectedPage || !conflict.value) return
      if (!value) {
        error.value = t('proto.traceRejected')
        return
      }
      if (operation.kind === 'context') checkContext(value as TraceContext, selected, selectedPage)
      else if (operation.kind.includes('relation')) checkRelation(value as PageRelation, selected)
      else checkDecision(value as TraceDecision, selected, selectedPage)
      serverRecord.value = value
    } catch (cause) {
      if (!current(epoch)) return
      if (cause instanceof ApiError && cause.status === 404)
        error.value = t('proto.traceRecordGone')
      else if (!deny(cause)) error.value = t('proto.traceLoadFailed')
    } finally {
      if (current(epoch)) loading.value = false
    }
  }
  function useCurrent() {
    const row = serverRecord.value
    if (!row || locked.value) return
    if ('references' in row) {
      context.value = row
      clearEditor()
    } else if ('fromPageId' in row) editRelation(row)
    else editDecision(row)
    error.value = ''
  }
  function selectPage(id: string) {
    if (locked.value || !pages.value.some((row) => row.pageId === id)) return
    generation++
    sourceSequence++
    sourceReader?.abort()
    sourceCandidates.value = undefined
    clearEditor()
    pageId.value = id
    relationIndex.value = decisionIndex.value = 0
    void load()
  }
  function queryRelations(index = 0) {
    if (!locked.value) {
      relationIndex.value = index
      appliedKeyword.value = keyword.value.trim()
      void load()
    }
  }
  watch(sourceKind, () => {
    sourceId.value = ''
    sourceIndex.value = 0
    if (mode.value === 'source') void loadSources()
  })
  watch(
    () =>
      JSON.stringify(
        authorized.value && [
          authorized.value.actorId,
          authorized.value.project.id,
          authorized.value.revision.id,
          authorized.value.context.runtimeBaseUrl,
          projectAllows(authorized.value.project, 'edit') && permissions.can(p.version.save),
        ],
      ),
    () => {
      clear()
      credential = token.get()
      const id = scope.value?.initialPage?.pageId
      pageId.value =
        pages.value.find((row) => row.pageId === id)?.pageId || pages.value[0]?.pageId || ''
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
    relations,
    decisions,
    context,
    entries,
    entryIndex,
    sourceCandidates,
    sourceDetail,
    sourceKind,
    sourceId,
    sourceIndex,
    sourceLoading,
    relationIndex,
    decisionIndex,
    direction,
    keyword,
    relationForm,
    decisionForm,
    mode,
    original,
    serverRecord,
    dirty,
    loading,
    busy,
    locked,
    unknown,
    conflict,
    error,
    notice,
    invalid,
    load,
    loadSources,
    readSource,
    editRelation,
    editDecision,
    addSource,
    save,
    updateReferences,
    removeSource,
    reconnect,
    remove,
    readCurrent,
    useCurrent,
    selectPage,
    queryRelations,
    clearEditor,
    retry: () => {
      if (unknown.value && pending) void execute(pending)
    },
    toggleEntry: () => updateReferences(refs(), !context.value?.entry),
  }
}
