import { computed, onScopeDispose, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import { Modal } from 'ant-design-vue'
import { download } from '@/shared/api/client'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'
import { secureId } from '@/shared/utils/secure-id'
import type { PageResult } from '@/shared/api/types'
import type { Revision } from '../types'
import type {
  MaterialSource,
  MaterialText,
  MaterialType,
  RevisionMaterial,
} from '../types/revision-material'
import { revisionMaterialsApi as api } from '../api/revision-material'
import {
  emptySource,
  normalizedSource,
  validMaterialFile,
  validSourceUrl,
} from '../utils/material-source'

type Mutation = {
  kind: 'upload' | 'declare' | 'update' | 'remove'
  key: string
  source: MaterialSource
  file?: File
  material?: RevisionMaterial
}
/** A pending request belongs to one fixed revision and keeps its exact payload through retries. */
export function useRevisionMaterials(
  revision: Ref<Revision>,
  readable: Ref<boolean>,
  editable: Ref<boolean>,
  actorId?: Ref<string>,
) {
  const report = shallowRef<PageResult<RevisionMaterial>>()
  const prototype = shallowRef<RevisionMaterial>()
  const selected = shallowRef<RevisionMaterial>()
  const mode = ref<'view' | 'upload' | 'source'>()
  const form = reactive<MaterialSource>(emptySource())
  const file = shallowRef<File>()
  const filter = ref<MaterialType | ''>('')
  const pageIndex = ref(0)
  const loading = ref(false),
    busy = ref(false),
    binaryBusy = ref(false)
  const error = ref(''),
    writeError = ref(''),
    notice = ref(''),
    conflict = ref(false)
  const previewUrl = ref('')
  const pending = shallowRef<Mutation>()
  const unknown = ref(false)
  const text = shallowRef<MaterialText>()
  const textLoading = ref(false),
    extracting = ref(false),
    textError = ref('')
  let textGeneration = 0,
    textController: AbortController | undefined
  let baseline = '',
    generation = 0,
    controller: AbortController | undefined
  let binaryController: AbortController | undefined
  const dirty = computed(
    () =>
      mode.value !== 'view' &&
      !!mode.value &&
      (!!file.value || JSON.stringify(normalizedSource(form)) !== baseline),
  )
  const blocked = computed(() => busy.value || unknown.value)
  function clearText() {
    textGeneration++
    textController?.abort()
    textController = undefined
    text.value = undefined
    textLoading.value = extracting.value = false
    textError.value = ''
  }
  function clearPreview() {
    binaryController?.abort()
    binaryController = undefined
    binaryBusy.value = false
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
  function clearEditor() {
    clearText()
    clearPreview()
    selected.value = undefined
    mode.value = undefined
    file.value = undefined
    Object.assign(form, emptySource())
    baseline = JSON.stringify(normalizedSource(form))
    writeError.value = ''
    conflict.value = false
  }
  function invalidate() {
    generation++
    controller?.abort()
    controller = undefined
    loading.value = busy.value = unknown.value = false
    pending.value = undefined
    report.value = prototype.value = undefined
    notice.value = error.value = ''
    clearEditor()
  }
  function authorized(cause: unknown) {
    if (
      cause instanceof ApiError &&
      ([401, 403].includes(cause.status) ||
        (cause.status === 404 && cause.code !== 'PROTOTYPE_HUB_MATERIAL_FILE_MISSING'))
    ) {
      invalidate()
      error.value = t('proto.materialForbidden')
      return false
    }
    return true
  }
  const matches = (row: RevisionMaterial) =>
    row.projectId === revision.value.projectId &&
    row.versionId === revision.value.versionId &&
    row.revisionId === revision.value.id
  async function load() {
    if (!readable.value || blocked.value) return
    const current = ++generation
    controller?.abort()
    controller = new AbortController()
    const options = { signal: controller.signal, silent: true }
    loading.value = true
    error.value = ''
    clearPreview()
    try {
      const scope = revision.value
      const [rows, source] = await Promise.all([
        api.query(
          scope.versionId,
          scope.id,
          {
            pageIndex: pageIndex.value,
            pageSize: 20,
            ...(filter.value ? { materialType: filter.value } : {}),
          },
          options,
        ),
        api.query(
          scope.versionId,
          scope.id,
          { pageIndex: 0, pageSize: 1, materialType: 'prototype' },
          options,
        ),
      ])
      if (current !== generation || !readable.value) return
      if (!rows.data.every(matches) || !source.data.every(matches))
        throw new Error(t('common.invalid'))
      report.value = rows
      prototype.value = source.data[0]
    } catch (cause) {
      if (current !== generation || (cause instanceof ApiError && cause.cancelled)) return
      if (!authorized(cause)) return
      report.value = undefined
      error.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (current === generation) loading.value = false
    }
  }
  async function canLeave() {
    if (blocked.value) return false
    if (!dirty.value) return true
    return new Promise<boolean>((resolve) =>
      Modal.confirm({
        title: t('proto.materialLeaveTitle'),
        content: t('proto.materialLeaveHint'),
        okText: t('proto.materialLeave'),
        cancelText: t('common.cancel'),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      }),
    )
  }
  async function openEditor(next: 'view' | 'upload' | 'source', row?: RevisionMaterial) {
    if (
      !readable.value ||
      blocked.value ||
      (next !== 'view' && !editable.value) ||
      !(await canLeave())
    )
      return
    clearEditor()
    if (row && !matches(row)) return
    selected.value = row
    mode.value = next
    Object.assign(form, emptySource(), normalizedSource(row || {}))
    baseline = JSON.stringify(normalizedSource(form))
    notice.value = ''
    if (next === 'view' && row?.materialType === 'document') await loadText()
  }
  /** Text requests are fenced separately so list paging cannot accept a prior document body. */
  async function loadText(extract = false) {
    const row = selected.value
    if (
      !readable.value ||
      mode.value !== 'view' ||
      row?.materialType !== 'document' ||
      !matches(row) ||
      (extract && (!editable.value || blocked.value || extracting.value))
    )
      return
    const current = ++textGeneration
    textController?.abort()
    const abort = new AbortController()
    textController = abort
    textLoading.value = true
    extracting.value = extract
    textError.value = ''
    // A failed refresh cannot leave previously authorized body text visible.
    text.value = undefined
    try {
      const result = await (extract ? api.extractText : api.text)(
        revision.value.versionId,
        revision.value.id,
        row.id,
        { signal: abort.signal, silent: true },
      )
      if (
        current !== textGeneration ||
        abort.signal.aborted ||
        !readable.value ||
        selected.value?.id !== row.id ||
        (extract && !editable.value)
      )
        return
      if (result.id !== row.id) throw new Error(t('common.invalid'))
      text.value = { ...result, content: result.status === 'READY' ? result.content : '' }
      const summary = {
        textStatus: result.status,
        textCharacterCount: result.characterCount,
        textExtractedAt: result.extractedAt,
        textExtractorVersion: result.extractorVersion,
      }
      selected.value = { ...row, ...summary }
      if (report.value)
        report.value = {
          ...report.value,
          data: report.value.data.map((value) =>
            value.id === row.id ? { ...value, ...summary } : value,
          ),
        }
      return true
    } catch (cause) {
      if (current !== textGeneration || abort.signal.aborted) return
      if (!authorized(cause)) return
      textError.value = cause instanceof Error ? cause.message : t('common.unknown')
      return true
    } finally {
      if (current === textGeneration) textLoading.value = extracting.value = false
    }
  }
  async function closeEditor() {
    if (!(await canLeave())) return false
    clearEditor()
    return true
  }
  /** A search source is resolved directly within its fixed revision, without walking list pages. */
  async function locate(id: string) {
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(id) ||
      !readable.value ||
      blocked.value ||
      !(await canLeave())
    )
      return
    clearEditor()
    const current = textGeneration
    const abort = new AbortController()
    textController = abort
    textLoading.value = true
    error.value = ''
    try {
      const row = await api.get(revision.value.versionId, revision.value.id, id, {
        signal: abort.signal,
        silent: true,
      })
      if (current !== textGeneration || abort.signal.aborted || !readable.value) return
      if (row.id !== id || !matches(row)) throw new Error(t('common.invalid'))
      await openEditor('view', row)
    } catch (cause) {
      if (current !== textGeneration || abort.signal.aborted) return
      if (!authorized(cause)) return
      error.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (current === textGeneration) textLoading.value = false
    }
  }
  function choose(value?: File) {
    if (!editable.value || blocked.value || mode.value !== 'upload' || !value) return
    writeError.value = ''
    file.value = undefined
    if (!validMaterialFile(value)) writeError.value = t('proto.materialFileInvalid')
    else file.value = value
  }
  async function run(command: Mutation) {
    if (!editable.value || busy.value || !readable.value) return
    const current = ++generation
    controller?.abort()
    const scope = revision.value
    const abort = new AbortController()
    controller = abort
    pending.value = command
    busy.value = true
    writeError.value = notice.value = ''
    conflict.value = false
    try {
      const options = { signal: abort.signal, silent: true }
      const row = command.material
      if (command.kind === 'upload')
        await api.upload(
          scope.versionId,
          scope.id,
          command.file!,
          command.source,
          command.key,
          options,
        )
      else if (command.kind === 'declare')
        await api.declare(scope.versionId, scope.id, command.source, command.key, options)
      else if (command.kind === 'update')
        await api.update(
          scope.versionId,
          scope.id,
          row!.id,
          command.source,
          row!.configVersion,
          command.key,
          options,
        )
      else
        await api.remove(
          scope.versionId,
          scope.id,
          row!.id,
          row!.configVersion,
          command.key,
          options,
        )
      if (current !== generation || !readable.value) return
      unknown.value = false
      pending.value = undefined
      clearEditor()
      notice.value = t(command.kind === 'remove' ? 'proto.materialDeleted' : 'proto.materialSaved')
      pageIndex.value = 0
    } catch (cause) {
      if (current !== generation || abort.signal.aborted) return
      if (!authorized(cause)) return
      unknown.value = !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500
      if (!unknown.value) pending.value = undefined
      conflict.value = cause instanceof ApiError && cause.code === 'PROTOTYPE_HUB_MATERIAL_CONFLICT'
      writeError.value = conflict.value
        ? t('proto.materialConflict')
        : cause instanceof Error
          ? cause.message
          : t('common.unknown')
    } finally {
      if (current === generation) {
        busy.value = false
        controller = undefined
        if (!pending.value) await load()
      }
    }
  }
  async function save() {
    if (!editable.value || blocked.value || conflict.value || !mode.value || mode.value === 'view')
      return
    writeError.value = ''
    const source = normalizedSource(form)
    if (!validSourceUrl(source.sourceUrl)) {
      writeError.value = t('proto.materialUrlInvalid')
      return
    }
    if (mode.value === 'upload' && !file.value) {
      writeError.value = t('proto.materialFileRequired')
      return
    }
    if (mode.value === 'source' && !selected.value && !Object.values(source).some(Boolean)) {
      writeError.value = t('proto.materialSourceRequired')
      return
    }
    await run({
      kind: mode.value === 'upload' ? 'upload' : selected.value ? 'update' : 'declare',
      key: secureId(),
      source,
      file: file.value,
      material: selected.value,
    })
  }
  async function remove(row: RevisionMaterial) {
    if (!editable.value || blocked.value || !matches(row) || !(await canLeave())) return
    Modal.confirm({
      title: t(
        row.materialType === 'prototype'
          ? 'proto.materialDeleteSourceTitle'
          : 'proto.materialDeleteTitle',
        { name: row.fileName },
      ),
      content: t(
        row.materialType === 'prototype'
          ? 'proto.materialDeleteSourceHint'
          : 'proto.materialDeleteHint',
      ),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: () => run({ kind: 'remove', key: secureId(), source: {}, material: row }),
    })
  }
  async function content(row: RevisionMaterial, preview = false) {
    if (
      !readable.value ||
      binaryBusy.value ||
      !matches(row) ||
      (preview && row.materialType !== 'image')
    )
      return
    clearPreview()
    const current = generation
    const abort = new AbortController()
    binaryController = abort
    binaryBusy.value = true
    writeError.value = ''
    try {
      const response = await api.content(revision.value.versionId, revision.value.id, row.id, {
        signal: abort.signal,
        silent: true,
      })
      if (current !== generation || !readable.value || abort.signal.aborted) return
      if (preview) {
        if (!/^image\/(png|jpeg)(?:;|$)/i.test(response.contentType))
          throw new Error(t('common.invalid'))
        previewUrl.value = URL.createObjectURL(
          new Blob([response.blob], { type: response.contentType }),
        )
      } else await download(response)
    } catch (cause) {
      if (current !== generation || abort.signal.aborted) return
      if (!authorized(cause)) return
      writeError.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (current === generation && binaryController === abort) binaryBusy.value = false
    }
  }
  async function changeFilter(value: MaterialType | '') {
    if (blocked.value || !(await canLeave())) return
    clearEditor()
    filter.value = value
    pageIndex.value = 0
    await load()
  }
  async function page(value: number) {
    if (blocked.value || !(await canLeave())) return
    clearEditor()
    pageIndex.value = value - 1
    await load()
  }
  async function refresh() {
    if (!(await canLeave())) return
    clearEditor()
    await load()
  }
  watch(
    [
      () => revision.value.id,
      () => revision.value.versionId,
      () => revision.value.projectId,
      () => actorId?.value,
      readable,
    ],
    () => {
      invalidate()
      if (readable.value) void load()
    },
    { immediate: true, flush: 'sync' },
  )
  watch(
    editable,
    (allowed) => {
      if (!allowed && mode.value !== 'view') invalidate()
      else if (!allowed && extracting.value) clearText()
    },
    { flush: 'sync' },
  )
  onScopeDispose(invalidate)
  return {
    report,
    prototype,
    selected,
    mode,
    form,
    file,
    filter,
    loading,
    busy,
    binaryBusy,
    error,
    writeError,
    notice,
    conflict,
    previewUrl,
    unknown,
    dirty,
    blocked,
    text,
    textLoading,
    extracting,
    textError,
    loadText,
    locate,
    load,
    refresh,
    canLeave,
    openEditor,
    closeEditor,
    choose,
    save,
    remove,
    content,
    changeFilter,
    page,
    retry: () => pending.value && run(pending.value),
  }
}
