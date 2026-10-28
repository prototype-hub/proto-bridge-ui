import { computed, onScopeDispose, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import { versionsApi, workItemsApi } from '@/modules/protohub-manager-ui/api'
import type {
  Project,
  Revision,
  Version,
  WorkItem,
  WorkItemInput,
  WorkItemDeleteInput,
  PrototypePage,
} from '@/modules/protohub-manager-ui/types'
import { usePermissions } from '@/shared/auth/provider'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import { secureId } from '@/shared/utils/secure-id'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'

export interface WorkItemsScope {
  actorId: string
  project: Project
  version: Version
  revision: Revision
}
/** Do not turn stored or typed links into executable or credential-bearing navigation. */
export function safeWorkItemUrl(value: string): boolean {
  if (
    !value ||
    value.length > 2048 ||
    Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)
  )
    return false
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
    )
  } catch {
    return false
  }
}

/** One member, fixed revision and page own the draft, requests and exact retry receipt. */
export function useWorkItems(scope: Ref<WorkItemsScope | undefined>) {
  const permissions = usePermissions()
  const target = computed(() => {
    const value = scope.value
    return value?.actorId &&
      value.project.id === value.version.projectId &&
      value.revision.versionId === value.version.id &&
      value.revision.projectId === value.project.id &&
      projectAllows(value.project, 'read') &&
      permissions.can(p.version.query)
      ? value
      : undefined
  })
  const canEdit = computed(
    () =>
      !!target.value &&
      projectAllows(target.value.project, 'edit') &&
      permissions.can(p.version.save),
  )
  const pages = shallowRef<{ value: string; label: string }[]>([])
  const pageId = ref('')
  const rows = shallowRef<WorkItem[]>([])
  const total = ref(0),
    pageIndex = ref(0),
    loading = ref(false),
    pagesLoading = ref(false),
    busy = ref(false)
  const error = ref(''),
    notice = ref(''),
    invalid = ref(''),
    unknown = ref(false),
    conflict = ref(false),
    editing = ref(false)
  const form = reactive({ url: '', note: '' })
  const original = shallowRef<WorkItem>()
  const dirty = computed(
    () =>
      editing.value &&
      (form.url !== (original.value?.url || '') || form.note !== (original.value?.note || '')),
  )
  let generation = 0,
    sequence = 0
  let readController: AbortController | undefined,
    pagesController: AbortController | undefined,
    writeController: AbortController | undefined
  type Pending =
    | { kind: 'create'; input: WorkItemInput }
    | { kind: 'update'; id: string; input: WorkItemInput & { expectedVersion: number } }
    | { kind: 'delete'; id: string; input: WorkItemDeleteInput }
  let pending: Pending | undefined
  function clearEditor() {
    original.value = undefined
    editing.value = unknown.value = conflict.value = false
    form.url = form.note = invalid.value = notice.value = ''
    pending = undefined
  }
  function reset() {
    generation++
    readController?.abort()
    pagesController?.abort()
    writeController?.abort()
    rows.value = []
    pages.value = []
    pageId.value = ''
    total.value = pageIndex.value = 0
    loading.value = pagesLoading.value = busy.value = false
    error.value = ''
    clearEditor()
  }
  function rejectAccess(cause: unknown) {
    if (!(cause instanceof ApiError) || ![401, 403, 404].includes(cause.status)) return false
    reset()
    error.value = t('proto.workItemUnavailable')
    return true
  }
  function check(row: WorkItem, selected: WorkItemsScope, page: string) {
    if (
      !row.id ||
      row.projectId !== selected.project.id ||
      row.versionId !== selected.version.id ||
      row.revisionId !== selected.revision.id ||
      row.pageId !== page ||
      !Number.isSafeInteger(row.configVersion) ||
      row.configVersion < 0
    )
      throw new ApiError(t('proto.workItemUnavailable'), 404)
    return row
  }
  async function load(reconcile = false) {
    const selected = target.value,
      page = pageId.value
    if (!selected || !page || busy.value) return
    readController?.abort()
    const request = new AbortController(),
      epoch = generation,
      serial = ++sequence
    readController = request
    loading.value = true
    error.value = ''
    try {
      const result = await workItemsApi.query(
        selected.version.id,
        {
          revisionId: selected.revision.id,
          pageId: page,
          pageIndex: pageIndex.value,
          pageSize: 20,
        },
        { signal: request.signal, silent: true },
      )
      if (epoch !== generation || serial !== sequence || request.signal.aborted) return
      rows.value = result.data.map((row) => check(row, selected, page))
      total.value = result.total
      if (reconcile && original.value) {
        const current = rows.value.find((row) => row.id === original.value?.id)
        if (current) {
          original.value = current
          conflict.value = false
          notice.value = t('proto.workItemRefreshed')
        }
      }
    } catch (cause) {
      if (epoch !== generation || serial !== sequence || request.signal.aborted) return
      if (!rejectAccess(cause)) {
        rows.value = []
        total.value = 0
        error.value = t('proto.workItemLoadFailed')
      }
    } finally {
      if (epoch === generation && serial === sequence) loading.value = false
    }
  }
  async function loadPages() {
    const selected = target.value
    if (!selected) return
    const request = new AbortController(),
      epoch = generation
    pagesController = request
    pagesLoading.value = true
    try {
      const result = await versionsApi.revisionPages(selected.version.id, selected.revision.id, {
        signal: request.signal,
        silent: true,
      })
      if (epoch !== generation || request.signal.aborted) return
      const flatten = (items: PrototypePage[]): { value: string; label: string }[] =>
        items.flatMap((item) => [
          ...(!item.folder && item.pageId && item.path
            ? [{ value: item.pageId, label: `${item.name} · ${item.path}` }]
            : []),
          ...flatten(item.children || []),
        ])
      pages.value = flatten(result)
      pagesLoading.value = false
      pageId.value = pages.value[0]?.value || ''
      if (!pageId.value) error.value = t('proto.workItemNoPages')
    } catch (cause) {
      if (epoch === generation && !request.signal.aborted && !rejectAccess(cause))
        error.value = t('proto.workItemLoadFailed')
    } finally {
      if (epoch === generation) pagesLoading.value = false
    }
  }
  function edit(row?: WorkItem) {
    if (!canEdit.value || !pageId.value || busy.value || unknown.value) return
    clearEditor()
    original.value = row
    editing.value = true
    form.url = row?.url || ''
    form.note = row?.note || ''
  }
  async function write(operation: Pending) {
    const selected = target.value,
      page = pageId.value
    if (!selected || !page || !canEdit.value || busy.value) return
    readController?.abort()
    sequence++
    loading.value = false
    const epoch = generation,
      request = new AbortController()
    writeController = request
    pending = operation
    busy.value = true
    notice.value = invalid.value = ''
    try {
      const options = { signal: request.signal, silent: true }
      if (operation.kind === 'delete')
        await workItemsApi.remove(selected.version.id, operation.id, operation.input, options)
      else {
        const result =
          operation.kind === 'create'
            ? await workItemsApi.create(selected.version.id, operation.input, options)
            : await workItemsApi.update(selected.version.id, operation.id, operation.input, options)
        check(result, selected, page)
      }
      if (epoch !== generation || request.signal.aborted) return
      clearEditor()
      busy.value = false
      if (operation.kind === 'delete' && rows.value.length === 1 && pageIndex.value > 0)
        pageIndex.value--
      await load()
    } catch (cause) {
      if (epoch !== generation || request.signal.aborted) return
      if (rejectAccess(cause)) return
      if (cause instanceof ApiError && cause.status === 409) {
        pending = undefined
        unknown.value = false
        conflict.value = true
        notice.value = t('proto.workItemConflict')
      } else if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        pending = undefined
        unknown.value = false
        notice.value = t('proto.workItemInvalid')
      } else {
        unknown.value = true
        notice.value = t('proto.workItemUnknown')
      }
    } finally {
      if (epoch === generation) busy.value = false
    }
  }
  function save() {
    const selected = target.value
    if (!selected || !editing.value || busy.value || unknown.value || conflict.value) return
    if (!safeWorkItemUrl(form.url.trim()) || form.note.length > 2000) {
      invalid.value = t('proto.workItemInputInvalid')
      return
    }
    const input = {
      revisionId: selected.revision.id,
      pageId: pageId.value,
      url: form.url.trim(),
      note: form.note,
      clientRequestId: secureId(),
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
  function remove(row: WorkItem) {
    if (!target.value || unknown.value || editing.value) return
    void write({
      kind: 'delete',
      id: row.id,
      input: {
        revisionId: target.value.revision.id,
        pageId: pageId.value,
        expectedVersion: row.configVersion,
        clientRequestId: secureId(),
      },
    })
  }
  function retry() {
    if (unknown.value && pending) void write(pending)
  }
  function discard() {
    if (!busy.value) {
      clearEditor()
      void load()
    }
  }
  function selectPage(value: string) {
    if (busy.value || unknown.value || !pages.value.some((row) => row.value === value)) return
    pageId.value = value
  }
  function page(number: number) {
    if (!busy.value && !unknown.value) {
      pageIndex.value = number - 1
      void load()
    }
  }
  watch(
    () =>
      JSON.stringify(
        target.value && {
          actor: target.value.actorId,
          project: target.value.project.id,
          version: target.value.version.id,
          revision: target.value.revision.id,
        },
      ),
    () => {
      reset()
      if (scope.value && !target.value) error.value = t('proto.workItemUnavailable')
      void loadPages()
    },
    { immediate: true, flush: 'sync' },
  )
  watch(
    pageId,
    () => {
      generation++
      readController?.abort()
      writeController?.abort()
      rows.value = []
      total.value = pageIndex.value = 0
      clearEditor()
      void load()
    },
    { flush: 'sync' },
  )
  watch(
    canEdit,
    (value) => {
      if (!value) {
        writeController?.abort()
        busy.value = false
        clearEditor()
      }
    },
    { flush: 'sync' },
  )
  onScopeDispose(reset)
  return {
    target,
    canEdit,
    pages,
    pageId,
    rows,
    total,
    pageIndex,
    loading,
    pagesLoading,
    busy,
    error,
    notice,
    invalid,
    unknown,
    conflict,
    editing,
    form,
    original,
    dirty,
    load,
    loadPages,
    edit,
    save,
    remove,
    retry,
    discard,
    selectPage,
    page,
  }
}
