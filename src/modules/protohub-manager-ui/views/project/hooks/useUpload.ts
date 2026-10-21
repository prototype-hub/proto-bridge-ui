import { computed, ref, reactive, watch, onScopeDispose, type Ref } from 'vue'
import { message } from 'ant-design-vue'
import { versionsApi } from '@/modules/protohub-manager-ui/api'
import { createCreationIntent } from '@/modules/protohub-manager-ui/utils/creation-intent'
import {
  FolderArchiveError,
  prepareFolderArchive,
  type FolderArchiveProgress,
  type FolderArchiveResult,
} from '@/modules/protohub-manager-ui/utils/folder-archive'
import { t } from '@/shared/i18n'
import { ApiError } from '@/shared/api/errors'
import type { UploadContext } from '@/modules/protohub-manager-ui/types'

export function validZip(file: File): boolean {
  return /\.zip$/i.test(file.name) && file.size > 0 && file.size <= 500 * 1024 * 1024
}

/** Keeps local packing separate from the existing upload API and isolates each dialog session. */
export function useUpload(
  open: Ref<boolean>,
  context: Ref<UploadContext>,
  done: () => void,
  close: () => void,
) {
  const phase = ref<'idle' | 'packing' | 'uploading'>('idle')
  const task = { busy: computed(() => phase.value !== 'idle'), error: ref('') }
  const form = reactive({ versionName: '', description: '' })
  const file = ref<File>()
  const folder = ref<Omit<FolderArchiveResult, 'file'>>()
  const packingProgress = ref<FolderArchiveProgress>({ phase: 'reading', percent: 0 })
  const progress = ref(0)
  const outcomeUnknown = ref(false)
  const intent = createCreationIntent()
  let controller: AbortController | undefined
  let generation = 0
  let disposed = false

  /** Invalidates callbacks before aborting; an old request may still resolve after a reopen. */
  function stop() {
    generation++
    controller?.abort()
    controller = undefined
    phase.value = 'idle'
  }

  const target = [open, () => context.value.projectId, () => context.value.version?.id] as const
  // A parent may switch targets without closing; discard work owned by the previous target.
  watch(
    target,
    () => {
      stop()
      intent.reset()
    },
    { flush: 'sync' },
  )
  watch(target, ([value]) => {
    if (value) {
      form.versionName = context.value.version?.versionName || ''
      form.description = context.value.version?.description || ''
      file.value = undefined
      folder.value = undefined
      progress.value = 0
      outcomeUnknown.value = false
      task.error.value = ''
    }
  })

  /** A real new selection replaces the previous file even when validation fails. */
  function clearSelection() {
    file.value = undefined
    folder.value = undefined
    task.error.value = ''
    outcomeUnknown.value = false
    progress.value = 0
    intent.reset()
  }

  function choose(selected: File) {
    if (task.busy.value || !open.value || disposed) return
    clearSelection()
    if (!validZip(selected)) {
      task.error.value = t('proto.zipInvalid')
      return
    }
    file.value = selected
  }

  /** Selecting a directory only prepares a ZIP. Saving remains an explicit create/update action. */
  async function chooseFolder(selected: readonly File[]) {
    // An empty FileList is the picker cancel event, not a request to clear a valid selection.
    if (selected.length === 0 || task.busy.value || !open.value || disposed) return
    clearSelection()
    const current = ++generation
    const abort = new AbortController()
    controller = abort
    phase.value = 'packing'
    packingProgress.value = { phase: 'reading', percent: 0 }
    try {
      const result = await prepareFolderArchive(selected, {
        signal: abort.signal,
        onProgress: (value) => {
          if (generation === current && !disposed) packingProgress.value = value
        },
      })
      if (generation !== current || disposed || !open.value) return
      file.value = result.file
      folder.value = {
        rootName: result.rootName,
        fileCount: result.fileCount,
        totalBytes: result.totalBytes,
      }
    } catch (cause) {
      if (generation !== current || disposed || abort.signal.aborted) return
      task.error.value = t(
        `proto.folderErrors.${cause instanceof FolderArchiveError ? cause.code : 'failed'}`,
      )
    } finally {
      if (generation === current && !disposed) {
        controller = undefined
        phase.value = 'idle'
      }
    }
  }

  /** Stops only local preparation; no server request has been made at this stage. */
  function cancelPacking() {
    if (phase.value !== 'packing') return
    stop()
    clearSelection()
  }

  async function submit() {
    if (task.busy.value || !open.value || disposed) return
    if (!file.value) {
      task.error.value = t('proto.zipInvalid')
      return
    }
    const current = ++generation
    const abort = new AbortController()
    controller = abort
    phase.value = 'uploading'
    progress.value = 0
    task.error.value = ''
    outcomeUnknown.value = false
    const options = {
      signal: abort.signal,
      silent: true,
      onUploadProgress: (event: { loaded: number; total?: number }) => {
        if (generation !== current || disposed) return
        progress.value = event.total
          ? Math.min(100, Math.round((event.loaded / event.total) * 100))
          : 0
      },
    }
    const args: [string, string, File] = [
      form.versionName.trim(),
      form.description.trim(),
      file.value,
    ]
    const target = context.value
    try {
      // Keep the generated File and creation key for a manual retry of an unknown POST result.
      await (target.version
        ? versionsApi.update(target.version.id, ...args, options)
        : versionsApi.upload(target.projectId, ...args, {
            ...options,
            headers: { 'Idempotency-Key': intent.key([target.projectId, ...args]) },
          }))
      if (generation !== current || disposed || !open.value) return
      intent.reset()
      void message.success(t('proto.uploadSuccess'))
      done()
      close()
    } catch (cause) {
      if (generation !== current || disposed || abort.signal.aborted) return
      if (cause instanceof ApiError && cause.cancelled) return
      outcomeUnknown.value = !(cause instanceof ApiError) || cause.status === 0
      task.error.value = cause instanceof Error ? cause.message : t('common.unknown')
    } finally {
      if (generation === current && !disposed) {
        controller = undefined
        phase.value = 'idle'
      }
    }
  }

  function cancel() {
    stop()
    close()
  }
  onScopeDispose(() => {
    disposed = true
    stop()
  })
  return {
    task,
    form,
    file,
    folder,
    phase,
    packingProgress,
    progress,
    outcomeUnknown,
    choose,
    chooseFolder,
    submit,
    cancelPacking,
    cancel,
  }
}
