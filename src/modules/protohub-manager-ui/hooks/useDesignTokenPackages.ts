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
import { emptySource, normalizedSource, validSourceUrl } from '../utils/material-source'
import { validDesignTokenFile } from '../utils/design-token-package'
import { designTokenPackagesApi as api } from '../api/design-token-package'
import type { MaterialSource } from '../types/revision-material'
import type {
  DesignTokenDocument,
  DesignTokenPackage,
  DesignTokenScope,
  DesignTokenTarget,
  DesignTokenMutation,
  DesignTokenImportResult,
} from '../types/design-token-package'

type Operation =
  | { kind: 'import'; file: File; source: MaterialSource; allowInvalid: boolean; key: string }
  | { kind: 'update'; id: string; source: MaterialSource; mutation: DesignTokenMutation }
  | { kind: 'delete'; id: string; mutation: DesignTokenMutation }

/** Private drafts and exact retries belong to one actor, credential and immutable revision. */
export function useDesignTokenPackages(scope: Ref<DesignTokenScope | undefined>) {
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
  const denied = ref(false)
  const canEdit = computed(
    () =>
      !!authorized.value &&
      !denied.value &&
      projectAllows(authorized.value.project, 'edit') &&
      permissions.can(p.version.save),
  )
  const target = computed<DesignTokenTarget | undefined>(() =>
    authorized.value
      ? {
          versionId: authorized.value.revision.versionId,
          revisionId: authorized.value.revision.id,
        }
      : undefined,
  )
  const rows = shallowRef<PageResult<DesignTokenPackage>>()
  const selected = shallowRef<DesignTokenPackage>()
  const document = shallowRef<DesignTokenDocument>()
  const preview = shallowRef<DesignTokenDocument>()
  const file = shallowRef<File>()
  const source = reactive(emptySource())
  const mode = ref<'browse' | 'import' | 'source'>('browse')
  const allowInvalid = ref(false),
    pageIndex = ref(0)
  const loading = ref(false),
    documentLoading = ref(false),
    validating = ref(false),
    busy = ref(false)
  const unknown = ref(false),
    conflict = ref(false)
  const serverRecord = shallowRef<DesignTokenPackage>()
  const error = ref(''),
    notice = ref(''),
    baseline = ref('')
  const locked = computed(() => busy.value || unknown.value)
  const dirty = computed(() =>
    mode.value === 'import'
      ? !!file.value || JSON.stringify(source) !== baseline.value
      : mode.value === 'source' && JSON.stringify(source) !== baseline.value,
  )
  let generation = 0,
    listSequence = 0,
    detailSequence = 0,
    previewSequence = 0
  let credential = token.get(),
    pending: Operation | undefined
  let listReader: AbortController | undefined,
    detailReader: AbortController | undefined,
    previewReader: AbortController | undefined,
    writer: AbortController | undefined

  function clearEditor() {
    // Changing editor ownership invalidates metadata and document reads before they can clear a draft.
    detailSequence++
    detailReader?.abort()
    detailReader = undefined
    documentLoading.value = false
    previewSequence++
    previewReader?.abort()
    validating.value = false
    mode.value = 'browse'
    file.value = preview.value = undefined
    Object.assign(source, emptySource())
    baseline.value = JSON.stringify(source)
    allowInvalid.value = unknown.value = conflict.value = false
    serverRecord.value = undefined
    pending = undefined
  }
  function clear() {
    generation++
    listSequence++
    detailSequence++
    listReader?.abort()
    detailReader?.abort()
    writer?.abort()
    rows.value = selected.value = document.value = undefined
    pageIndex.value = 0
    loading.value = documentLoading.value = busy.value = denied.value = false
    error.value = notice.value = ''
    clearEditor()
  }
  function current(epoch: number) {
    if (epoch !== generation) return false
    if (credential !== token.get()) {
      clear()
      denied.value = true
      error.value = t('proto.tokenUnavailable')
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
    error.value = t('proto.tokenUnavailable')
    return true
  }
  function checkPackage(value: DesignTokenPackage, fixed: DesignTokenTarget) {
    if (
      !value?.id ||
      value.projectId !== authorized.value?.project.id ||
      value.versionId !== fixed.versionId ||
      value.revisionId !== fixed.revisionId ||
      !Number.isSafeInteger(value.configVersion) ||
      value.configVersion < 0
    )
      throw new ApiError(t('proto.tokenUnavailable'), 404)
  }
  function checkDocument(value: DesignTokenDocument) {
    if (
      !value ||
      !Array.isArray(value.tokens) ||
      value.tokens.length > 5000 ||
      !Array.isArray(value.groups) ||
      !Array.isArray(value.issues) ||
      value.issues.length > 128 ||
      !Array.isArray(value.sets) ||
      !Array.isArray(value.modifiers) ||
      !value.inputs
    )
      throw new ApiError(t('proto.tokenLoadFailed'), 502)
  }
  function failure(cause: unknown, fallback: string) {
    return cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.message
      ? cause.message
      : t(`proto.${fallback}`)
  }
  async function load(index = pageIndex.value) {
    const fixed = target.value
    if (!fixed || !current(generation) || busy.value) return
    listReader?.abort()
    const controller = new AbortController(),
      epoch = generation,
      serial = ++listSequence
    listReader = controller
    pageIndex.value = index
    loading.value = true
    try {
      const value = await api.query(
        fixed,
        { pageIndex: index, pageSize: 20 },
        { signal: controller.signal, silent: true },
      )
      if (!current(epoch) || serial !== listSequence || controller.signal.aborted) return
      if (
        !Array.isArray(value.data) ||
        value.data.length > 20 ||
        !Number.isSafeInteger(value.total) ||
        value.total < 0
      )
        throw new ApiError(t('proto.tokenLoadFailed'), 502)
      value.data.forEach((row) => checkPackage(row, fixed))
      rows.value = value
      if (!value.data.length && value.total && index > 0)
        void load(Math.max(0, Math.ceil(value.total / 20) - 1))
    } catch (cause) {
      if (
        current(epoch) &&
        serial === listSequence &&
        !controller.signal.aborted &&
        !deny(cause, true)
      )
        error.value = failure(cause, 'tokenLoadFailed')
    } finally {
      if (current(epoch) && serial === listSequence) loading.value = false
    }
  }
  async function loadDocument(inputs?: Record<string, string>) {
    const fixed = target.value,
      row = selected.value
    if (!fixed || !row || mode.value !== 'browse' || locked.value || !current(generation)) return
    detailReader?.abort()
    const controller = new AbortController(),
      epoch = generation,
      serial = ++detailSequence
    detailReader = controller
    documentLoading.value = true
    try {
      let value = await api.document(fixed, row.id, inputs, {
        signal: controller.signal,
        silent: true,
      })
      if (
        !current(epoch) ||
        serial !== detailSequence ||
        controller.signal.aborted ||
        mode.value !== 'browse' ||
        selected.value?.id !== row.id
      )
        return
      checkDocument(value)
      // Initial parsing checks every context; the explicit projection reports this chosen view only.
      if (inputs === undefined && value.format === 'resolver') {
        value = await api.document(fixed, row.id, value.inputs, {
          signal: controller.signal,
          silent: true,
        })
        if (
          !current(epoch) ||
          serial !== detailSequence ||
          controller.signal.aborted ||
          mode.value !== 'browse' ||
          selected.value?.id !== row.id
        )
          return
        checkDocument(value)
      }
      document.value = value
    } catch (cause) {
      if (current(epoch) && serial === detailSequence && !controller.signal.aborted && !deny(cause))
        error.value = failure(cause, 'tokenDocumentFailed')
    } finally {
      if (current(epoch) && serial === detailSequence) documentLoading.value = false
    }
  }
  async function show(row: DesignTokenPackage) {
    const fixed = target.value
    if (!fixed || locked.value || !current(generation)) return false
    clearEditor()
    const controller = new AbortController(),
      epoch = generation,
      serial = ++detailSequence
    detailReader = controller
    documentLoading.value = true
    error.value = notice.value = ''
    try {
      const value = await api.get(fixed, row.id, { signal: controller.signal, silent: true })
      if (
        !current(epoch) ||
        serial !== detailSequence ||
        controller.signal.aborted ||
        mode.value !== 'browse'
      )
        return false
      checkPackage(value, fixed)
      selected.value = value
      document.value = undefined
      await loadDocument()
      return current(epoch) && mode.value === 'browse' && selected.value?.id === value.id
    } catch (cause) {
      if (current(epoch) && serial === detailSequence && !controller.signal.aborted && !deny(cause))
        error.value = failure(cause, 'tokenLoadFailed')
    } finally {
      if (current(epoch) && serial === detailSequence) documentLoading.value = false
    }
    return false
  }
  function startImport() {
    if (!canEdit.value || locked.value) return
    clearEditor()
    mode.value = 'import'
    error.value = notice.value = ''
  }
  async function pickFile(value?: File) {
    if (!value || !canEdit.value || locked.value || mode.value !== 'import') return
    previewReader?.abort()
    const serial = ++previewSequence,
      epoch = generation,
      fixed = target.value
    file.value = preview.value = undefined
    allowInvalid.value = false
    error.value = ''
    if (!validDesignTokenFile(value)) {
      error.value = t('proto.tokenFileLimit')
      return
    }
    file.value = value
    if (!fixed) return
    const controller = new AbortController()
    previewReader = controller
    validating.value = true
    try {
      const result = await api.validate(fixed, value, { signal: controller.signal, silent: true })
      if (!current(epoch) || serial !== previewSequence || controller.signal.aborted) return
      checkDocument(result)
      preview.value = result
    } catch (cause) {
      if (
        current(epoch) &&
        serial === previewSequence &&
        !controller.signal.aborted &&
        !deny(cause)
      )
        error.value = failure(cause, 'tokenValidationFailed')
    } finally {
      if (current(epoch) && serial === previewSequence) validating.value = false
    }
  }
  function updateSource(key: keyof MaterialSource, value: string) {
    if (canEdit.value && !locked.value && !conflict.value) source[key] = value
  }
  function editSource() {
    if (!canEdit.value || locked.value || !selected.value) return
    clearEditor()
    mode.value = 'source'
    for (const key of Object.keys(emptySource()) as (keyof MaterialSource)[])
      source[key] = selected.value[key] || ''
    baseline.value = JSON.stringify(source)
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
    let openAfter: DesignTokenPackage | undefined
    try {
      const options = { signal: controller.signal, silent: true }
      const result =
        operation.kind === 'import'
          ? await api.import(
              fixed,
              operation.file,
              operation.source,
              operation.allowInvalid,
              operation.key,
              options,
            )
          : operation.kind === 'update'
            ? await api.update(fixed, operation.id, operation.source, operation.mutation, options)
            : await api.remove(fixed, operation.id, operation.mutation, options)
      if (!current(epoch) || controller.signal.aborted || !canEdit.value) return
      if (operation.kind === 'import') {
        const value = result as DesignTokenImportResult
        if (
          !value?.id ||
          (value.status === 'missing'
            ? value.package !== null
            : value.status !== 'current' || !value.package)
        )
          throw new ApiError(t('proto.tokenUnknown'), 502)
        if (value.package) {
          checkPackage(value.package, fixed)
          if (value.package.id !== value.id) throw new ApiError(t('proto.tokenUnknown'), 502)
          openAfter = value.package
        }
        clearEditor()
        notice.value = t(
          value.status === 'missing'
            ? 'proto.tokenImportMissing'
            : value.package?.valid
              ? 'proto.tokenImported'
              : 'proto.tokenImportedInvalid',
        )
      } else if (operation.kind === 'update') {
        const value = result as DesignTokenPackage
        checkPackage(value, fixed)
        selected.value = value
        clearEditor()
        notice.value = t('proto.tokenSourceSaved')
      } else {
        if (result !== true) throw new ApiError(t('proto.tokenUnknown'), 502)
        if (selected.value?.id === operation.id) selected.value = document.value = undefined
        clearEditor()
        notice.value = t('proto.tokenRemoved')
      }
    } catch (cause) {
      if (!current(epoch) || controller.signal.aborted || deny(cause)) return
      if (cause instanceof ApiError && cause.code === 'PROTOTYPE_HUB_TOKEN_PACKAGE_LIMIT_REACHED') {
        pending = undefined
        conflict.value = false
        error.value = failure(cause, 'tokenRejected')
      } else if (cause instanceof ApiError && [404, 409].includes(cause.status)) {
        conflict.value = true
        error.value = t(
          cause.code?.includes('IDEMPOTENCY')
            ? 'proto.tokenRequestConflict'
            : cause.status === 404
              ? 'proto.tokenGone'
              : 'proto.tokenConflict',
        )
      } else if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        ![408, 429].includes(cause.status)
      ) {
        pending = undefined
        error.value = failure(cause, 'tokenRejected')
      } else {
        unknown.value = true
        error.value = t('proto.tokenUnknown')
      }
    } finally {
      if (current(epoch)) {
        busy.value = false
        if (!unknown.value && !denied.value) void load()
        if (openAfter) {
          selected.value = openAfter
          document.value = undefined
          void loadDocument()
        }
      }
    }
  }
  function save() {
    if (!canEdit.value || locked.value || conflict.value || !validSourceUrl(source.sourceUrl))
      return
    const frozen = Object.freeze(normalizedSource(source))
    if (
      mode.value === 'import' &&
      file.value &&
      preview.value &&
      !validating.value &&
      (preview.value.valid || allowInvalid.value)
    ) {
      void execute({
        kind: 'import',
        file: file.value,
        source: frozen,
        allowInvalid: allowInvalid.value,
        key: secureId(),
      })
    } else if (mode.value === 'source' && selected.value) {
      void execute({
        kind: 'update',
        id: selected.value.id,
        source: frozen,
        mutation: { expectedVersion: selected.value.configVersion, clientRequestId: secureId() },
      })
    }
  }
  function remove() {
    if (!selected.value || !canEdit.value || locked.value || conflict.value) return
    void execute({
      kind: 'delete',
      id: selected.value.id,
      mutation: { expectedVersion: selected.value.configVersion, clientRequestId: secureId() },
    })
  }
  function retry() {
    if (unknown.value && pending && !busy.value) void execute(pending)
  }
  async function readCurrent() {
    const fixed = target.value,
      operation = pending,
      epoch = generation
    if (!fixed || !operation || operation.kind === 'import' || !conflict.value || locked.value)
      return
    try {
      const value = await api.get(fixed, operation.id, { silent: true })
      if (!current(epoch) || pending !== operation) return
      checkPackage(value, fixed)
      serverRecord.value = value
    } catch (cause) {
      if (current(epoch) && pending === operation && !deny(cause))
        error.value = failure(cause, 'tokenLoadFailed')
    }
  }
  function resolveConflict(keepDraft: boolean) {
    const value = serverRecord.value
    if (!value || locked.value) return
    selected.value = value
    if (keepDraft && mode.value === 'source') {
      pending = undefined
      conflict.value = false
      serverRecord.value = undefined
    } else {
      clearEditor()
    }
    error.value = ''
  }
  async function downloadOriginal() {
    const fixed = target.value,
      row = selected.value,
      epoch = generation
    if (!fixed || !row || locked.value || !current(epoch)) return
    try {
      const value = await api.content(fixed, row.id, { silent: true })
      if (!current(epoch) || selected.value?.id !== row.id) return
      await download({ ...value, filename: value.filename || row.fileName })
    } catch (cause) {
      if (current(epoch) && !deny(cause)) error.value = failure(cause, 'tokenDownloadFailed')
    }
  }
  watch(
    () =>
      JSON.stringify(
        authorized.value && [
          authorized.value.actorId,
          authorized.value.project.id,
          authorized.value.revision.versionId,
          authorized.value.revision.id,
          projectAllows(authorized.value.project, 'edit') && permissions.can(p.version.save),
        ],
      ),
    () => {
      clear()
      credential = token.get()
      if (authorized.value) void load()
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
    rows,
    selected,
    document,
    preview,
    file,
    source,
    mode,
    allowInvalid,
    pageIndex,
    loading,
    documentLoading,
    validating,
    busy,
    unknown,
    conflict,
    serverRecord,
    error,
    notice,
    canEdit,
    denied,
    locked,
    dirty,
    load,
    show,
    loadDocument,
    startImport,
    pickFile,
    updateSource,
    editSource,
    save,
    remove,
    retry,
    readCurrent,
    resolveConflict,
    clearEditor,
    downloadOriginal,
  }
}
