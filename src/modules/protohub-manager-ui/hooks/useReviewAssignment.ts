import { computed, ref, shallowRef, watch, onScopeDispose, type Ref } from 'vue'
import { reviewThreadsApi } from '../api/review-thread'
import type { ReviewThreadScope } from './useReviewThreads'
import type { ReviewAssignment, ReviewAssignee, ReviewAssignmentInput } from '../types'
import { usePermissions } from '@/shared/auth/provider'
import { protoPermissions as p } from '../routes/permissions'
import { ApiError } from '@/shared/api/errors'
import { secureId } from '@/shared/utils/secure-id'
import { t } from '@/shared/i18n'

/** Assignment owns its own requests and receipt; refreshing it never mutates a reply draft. */
export function useReviewAssignment(
  scope: Ref<ReviewThreadScope | undefined>,
  open: Ref<boolean>,
  selectedId: Ref<string | undefined>,
  readable: Ref<boolean>,
) {
  const permissions = usePermissions()
  const target = computed(() =>
    scope.value?.kind === 'member' && open.value && readable.value && selectedId.value
      ? {
          versionId: scope.value.versionId,
          id: selectedId.value,
          actorId: scope.value.actorId,
          projectId: scope.value.project.id,
          revisionId: scope.value.page.revisionId,
          pageId: scope.value.page.pageId,
        }
      : undefined,
  )
  const canEdit = computed(() => !!target.value && permissions.can(p.version.save))
  const data = shallowRef<ReviewAssignment>(),
    candidates = shallowRef<ReviewAssignee[]>([])
  const loading = ref(false),
    searching = ref(false),
    busy = ref(false),
    editing = ref(false),
    unknown = ref(false)
  const error = ref(''),
    searchError = ref(''),
    notice = ref(''),
    keyword = ref(''),
    selection = ref<string>()
  const pageIndex = ref(0),
    total = ref(0)
  let generation = 0,
    detailSequence = 0,
    candidateSequence = 0
  let detailController: AbortController | undefined,
    candidateController: AbortController | undefined,
    writeController: AbortController | undefined
  let pending: ReviewAssignmentInput | undefined
  function clearEditor() {
    candidateSequence++
    candidateController?.abort()
    candidates.value = []
    editing.value = searching.value = false
    keyword.value = searchError.value = ''
    pageIndex.value = total.value = 0
    selection.value = undefined
  }
  function reset() {
    generation++
    detailController?.abort()
    writeController?.abort()
    clearEditor()
    data.value = pending = undefined
    loading.value = busy.value = unknown.value = false
    error.value = notice.value = ''
  }
  function check(value: ReviewAssignment, id: string) {
    if (
      value.threadId !== id ||
      !Number.isSafeInteger(value.assignmentVersion) ||
      value.assignmentVersion < 0
    )
      throw new ApiError(t('proto.assignmentUnavailable'), 404)
    return value
  }
  function accessRejected(cause: unknown) {
    if (!(cause instanceof ApiError) || ![403, 404].includes(cause.status)) return false
    reset()
    error.value = t('proto.assignmentUnavailable')
    return true
  }
  async function load() {
    const current = target.value
    if (!current || busy.value) return
    detailController?.abort()
    const request = new AbortController(),
      epoch = generation,
      sequence = ++detailSequence
    detailController = request
    loading.value = true
    error.value = ''
    try {
      const value = await reviewThreadsApi.assignment(
        current.versionId,
        current.id,
        { revisionId: current.revisionId, pageId: current.pageId },
        { signal: request.signal, silent: true },
      )
      if (epoch === generation && sequence === detailSequence && !request.signal.aborted)
        data.value = check(value, current.id)
    } catch (cause) {
      if (epoch !== generation || sequence !== detailSequence || request.signal.aborted) return
      if (accessRejected(cause)) return
      data.value = undefined
      clearEditor()
      error.value = t('proto.assignmentUnavailable')
    } finally {
      if (epoch === generation && sequence === detailSequence) loading.value = false
    }
  }
  async function search(number = 1) {
    const current = target.value
    if (!current || !canEdit.value || !editing.value || busy.value || unknown.value) return
    candidateController?.abort()
    const request = new AbortController(),
      epoch = generation,
      sequence = ++candidateSequence
    candidateController = request
    candidates.value = []
    selection.value = undefined
    total.value = 0
    searching.value = false
    searchError.value = ''
    if (keyword.value.length > 100) {
      searchError.value = t('proto.assignmentKeywordInvalid')
      return
    }
    pageIndex.value = Math.max(0, Math.min(10000, number - 1))
    searching.value = true
    try {
      const value = await reviewThreadsApi.assignees(
        current.versionId,
        current.id,
        {
          revisionId: current.revisionId,
          pageId: current.pageId,
          pageIndex: pageIndex.value,
          pageSize: 20,
          keyword: keyword.value,
        },
        { signal: request.signal, silent: true },
      )
      if (epoch !== generation || sequence !== candidateSequence || request.signal.aborted) return
      candidates.value = value.data
      total.value = value.total
    } catch (cause) {
      if (
        epoch === generation &&
        sequence === candidateSequence &&
        !request.signal.aborted &&
        !accessRejected(cause)
      )
        searchError.value = t('proto.assignmentUnavailable')
    } finally {
      if (epoch === generation && sequence === candidateSequence) searching.value = false
    }
  }
  function edit() {
    if (!canEdit.value || !data.value || busy.value || unknown.value) return
    clearEditor()
    editing.value = true
    void search()
  }
  function cancel() {
    if (busy.value || unknown.value) return
    clearEditor()
  }
  async function write(input: ReviewAssignmentInput) {
    const current = target.value
    if (!current || !canEdit.value || busy.value) return
    // A same-target refresh started before this write must not overwrite its committed result.
    detailController?.abort()
    detailSequence++
    loading.value = false
    const epoch = generation,
      request = new AbortController()
    writeController = request
    pending = input
    busy.value = true
    notice.value = error.value = ''
    try {
      const value = await reviewThreadsApi.assign(current.versionId, current.id, input, {
        signal: request.signal,
        silent: true,
      })
      if (epoch !== generation || request.signal.aborted) return
      data.value = check(value, current.id)
      pending = undefined
      unknown.value = false
      clearEditor()
    } catch (cause) {
      if (epoch !== generation || request.signal.aborted) return
      if (cause instanceof ApiError && cause.status === 409) {
        pending = undefined
        unknown.value = false
        busy.value = false
        clearEditor()
        await load()
        if (epoch === generation) notice.value = t('proto.assignmentConflict')
      } else if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        pending = undefined
        unknown.value = false
        if (!accessRejected(cause)) notice.value = t('proto.assignmentInvalid')
      } else {
        unknown.value = true
        notice.value = t('proto.assignmentUnknown')
      }
    } finally {
      if (epoch === generation) busy.value = false
    }
  }
  function save(clear = false) {
    const current = target.value
    if (
      !current ||
      !data.value ||
      unknown.value ||
      (!clear &&
        (!editing.value || !candidates.value.some((row) => row.userId === selection.value)))
    )
      return
    void write({
      revisionId: current.revisionId,
      pageId: current.pageId,
      assigneeId: clear ? null : selection.value!,
      expectedVersion: data.value.assignmentVersion,
      clientRequestId: secureId(),
    })
  }
  function retry() {
    if (unknown.value && pending) void write(pending)
  }
  function discard() {
    if (busy.value) return
    pending = undefined
    unknown.value = false
    notice.value = ''
    clearEditor()
    void load()
  }
  watch(
    () => JSON.stringify(target.value),
    () => {
      reset()
      void load()
    },
    { immediate: true, flush: 'sync' },
  )
  watch(
    canEdit,
    (allowed) => {
      if (!allowed) {
        writeController?.abort()
        clearEditor()
        pending = undefined
        busy.value = unknown.value = false
        notice.value = ''
      }
    },
    { flush: 'sync' },
  )
  onScopeDispose(reset)
  return {
    data,
    candidates,
    loading,
    searching,
    busy,
    editing,
    unknown,
    error,
    searchError,
    notice,
    keyword,
    selection,
    pageIndex,
    total,
    canEdit,
    load,
    search,
    edit,
    cancel,
    save,
    retry,
    discard,
  }
}
