import { computed, onScopeDispose, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import { pageDeliveriesApi } from '@/modules/protohub-manager-ui/api'
import type {
  PageDelivery,
  PageDeliveryCandidate,
  PageDeliveryInput,
  PageDeliveryState,
  Project,
  Revision,
} from '@/modules/protohub-manager-ui/types'
import { usePermissions } from '@/shared/auth/provider'
import { token } from '@/shared/auth/token'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import { secureId } from '@/shared/utils/secure-id'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'

export const deliveryStates: PageDeliveryState[] = ['DRAFT', 'READY', 'IN_PROGRESS', 'DONE']
export interface PageDeliveriesScope {
  actorId: string
  project: Project
  revision: Revision
}
/** A fixed revision owns the list; a fixed page owns the draft and exact retry request. */
export function usePageDeliveries(
  scope: Ref<PageDeliveriesScope | undefined>,
  initialPage: Ref<string | undefined>,
) {
  const permissions = usePermissions()
  const target = computed(() => {
    const value = scope.value
    return value?.actorId &&
      value.project.id === value.revision.projectId &&
      value.revision.id &&
      value.revision.versionId &&
      projectAllows(value.project, 'read') &&
      permissions.can(p.version.query)
      ? value
      : undefined
  })
  const unavailable = ref(false)
  const editAccess = computed(
    () =>
      !!target.value &&
      projectAllows(target.value.project, 'edit') &&
      permissions.can(p.version.save),
  )
  const canEdit = computed(() => editAccess.value && !unavailable.value)
  const rows = shallowRef<PageDelivery[]>([]),
    current = shallowRef<PageDelivery>()
  const selectedPageId = ref(''),
    filter = ref<PageDeliveryState>(),
    pageIndex = ref(0),
    total = ref(0)
  const loading = ref(false),
    detailLoading = ref(false),
    busy = ref(false),
    error = ref(''),
    detailError = ref('')
  const notice = ref(''),
    invalid = ref(''),
    unknown = ref(false),
    conflict = ref(false)
  const candidates = shallowRef<PageDeliveryCandidate[]>([]),
    candidateKeyword = ref(''),
    candidateIndex = ref(0),
    candidateTotal = ref(0),
    candidatesLoading = ref(false),
    candidateError = ref('')
  const form = reactive({
    state: undefined as PageDeliveryState | undefined,
    assigneeId: null as string | null,
    reason: '',
  })
  const dirty = computed(
    () =>
      !!current.value &&
      (form.state !== (current.value.state || undefined) ||
        form.assigneeId !== (current.value.assignee?.userId || null) ||
        form.reason !== current.value.reason),
  )
  const unavailableAssignee = computed(
    () =>
      !!current.value?.assignee &&
      !current.value.assignee.available &&
      form.assigneeId === current.value.assignee.userId,
  )
  let generation = 0,
    listSerial = 0,
    detailSerial = 0,
    candidateSerial = 0
  let listController: AbortController | undefined,
    detailController: AbortController | undefined,
    candidateController: AbortController | undefined,
    writeController: AbortController | undefined
  let pending: { pageId: string; input: PageDeliveryInput } | undefined
  function clearDraft() {
    current.value = undefined
    form.state = undefined
    form.assigneeId = null
    form.reason = notice.value = invalid.value = detailError.value = ''
    unknown.value = conflict.value = false
    pending = undefined
  }
  function reset() {
    generation++
    listController?.abort()
    detailController?.abort()
    candidateController?.abort()
    writeController?.abort()
    rows.value = []
    candidates.value = []
    selectedPageId.value = ''
    total.value = pageIndex.value = candidateIndex.value = candidateTotal.value = 0
    filter.value = undefined
    candidateKeyword.value = candidateError.value = error.value = ''
    loading.value =
      detailLoading.value =
      candidatesLoading.value =
      busy.value =
      unavailable.value =
        false
    clearDraft()
  }
  function rejectAccess(cause: unknown) {
    if (!(cause instanceof ApiError) || ![401, 403, 404].includes(cause.status)) return false
    reset()
    unavailable.value = true
    error.value = t('proto.deliveryUnavailable')
    return true
  }
  function check(row: PageDelivery, selected: PageDeliveriesScope, pageId?: string) {
    if (
      row.projectId !== selected.project.id ||
      row.versionId !== selected.revision.versionId ||
      row.revisionId !== selected.revision.id ||
      !row.pageId ||
      (pageId && row.pageId !== pageId) ||
      !Number.isSafeInteger(row.configVersion) ||
      row.configVersion < 0 ||
      (row.state !== null && !deliveryStates.includes(row.state))
    )
      throw new ApiError(t('proto.deliveryUnavailable'), 404)
    return row
  }
  function context() {
    const epoch = generation,
      credential = token.get()
    return () => {
      if (epoch !== generation) return false
      if (credential !== token.get()) {
        reset()
        unavailable.value = true
        error.value = t('proto.deliveryUnavailable')
        return false
      }
      return true
    }
  }
  function adopt(row: PageDelivery) {
    current.value = row
    form.state = row.state || undefined
    form.assigneeId = row.assignee?.userId || null
    form.reason = row.reason
  }
  async function loadList() {
    const selected = target.value
    if (!selected || unavailable.value) return
    listController?.abort()
    const controller = new AbortController(),
      serial = ++listSerial,
      valid = context()
    listController = controller
    loading.value = true
    error.value = ''
    try {
      const result = await pageDeliveriesApi.query(
        selected.revision.versionId,
        {
          revisionId: selected.revision.id,
          ...(filter.value ? { state: filter.value } : {}),
          pageIndex: pageIndex.value,
          pageSize: 20,
        },
        { signal: controller.signal, silent: true },
      )
      if (!valid() || serial !== listSerial || controller.signal.aborted) return
      rows.value = result.data.map((row) => check(row, selected))
      total.value = result.total
    } catch (cause) {
      if (!valid() || serial !== listSerial || controller.signal.aborted) return
      if (!rejectAccess(cause)) {
        rows.value = []
        total.value = 0
        error.value = t('proto.deliveryLoadFailed')
      }
    } finally {
      if (valid() && serial === listSerial) loading.value = false
    }
  }
  async function loadDetail(keepDraft = false) {
    const selected = target.value,
      pageId = selectedPageId.value
    if (!selected || !pageId || busy.value || unavailable.value) return
    detailController?.abort()
    const controller = new AbortController(),
      serial = ++detailSerial,
      valid = context()
    detailController = controller
    detailLoading.value = true
    detailError.value = ''
    try {
      const row = await pageDeliveriesApi.get(
        selected.revision.versionId,
        pageId,
        selected.revision.id,
        { signal: controller.signal, silent: true },
      )
      if (!valid() || serial !== detailSerial || controller.signal.aborted) return
      check(row, selected, pageId)
      if (keepDraft || unknown.value) current.value = row
      else adopt(row)
      if (!unknown.value && keepDraft) {
        conflict.value = false
        notice.value = t('proto.deliveryRefreshed')
      }
    } catch (cause) {
      if (!valid() || serial !== detailSerial || controller.signal.aborted) return
      if (!rejectAccess(cause)) detailError.value = t('proto.deliveryLoadFailed')
    } finally {
      if (valid() && serial === detailSerial) detailLoading.value = false
    }
  }
  async function loadCandidates() {
    const selected = target.value
    if (!selected || !canEdit.value || busy.value || unknown.value) return
    candidateController?.abort()
    const controller = new AbortController(),
      serial = ++candidateSerial,
      valid = context()
    candidateController = controller
    candidatesLoading.value = true
    candidateError.value = ''
    try {
      const result = await pageDeliveriesApi.candidates(
        selected.revision.versionId,
        {
          revisionId: selected.revision.id,
          keyword: candidateKeyword.value.trim(),
          pageIndex: candidateIndex.value,
          pageSize: 20,
        },
        { signal: controller.signal, silent: true },
      )
      if (!valid() || serial !== candidateSerial || controller.signal.aborted) return
      candidates.value = result.data
      candidateTotal.value = result.total
    } catch (cause) {
      if (!valid() || serial !== candidateSerial || controller.signal.aborted) return
      if (!rejectAccess(cause)) {
        candidates.value = []
        candidateTotal.value = 0
        candidateError.value = t('proto.deliveryCandidateError')
      }
    } finally {
      if (valid() && serial === candidateSerial) candidatesLoading.value = false
    }
  }
  function selectPage(pageId: string) {
    if (busy.value || unknown.value) return
    detailController?.abort()
    candidateController?.abort()
    detailSerial++
    candidateSerial++
    clearDraft()
    selectedPageId.value = pageId
    if (pageId) {
      void loadDetail()
      void loadCandidates()
    }
  }
  function changeFilter(value?: PageDeliveryState) {
    if (busy.value || unknown.value) return
    selectPage('')
    filter.value = value
    pageIndex.value = 0
    void loadList()
  }
  function page(value: number) {
    if (busy.value || unknown.value) return
    selectPage('')
    pageIndex.value = value - 1
    void loadList()
  }
  function searchCandidates(keyword: string) {
    candidateKeyword.value = keyword.slice(0, 100)
    candidateIndex.value = 0
    void loadCandidates()
  }
  function candidatePage(value: number) {
    candidateIndex.value = value - 1
    void loadCandidates()
  }
  async function write(operation: { pageId: string; input: PageDeliveryInput }) {
    const selected = target.value
    if (!selected || !canEdit.value || busy.value || operation.pageId !== selectedPageId.value)
      return
    detailController?.abort()
    detailSerial++
    detailLoading.value = false
    const controller = new AbortController(),
      valid = context()
    writeController = controller
    pending = operation
    busy.value = true
    notice.value = invalid.value = ''
    try {
      const row = await pageDeliveriesApi.save(
        selected.revision.versionId,
        operation.pageId,
        operation.input,
        { signal: controller.signal, silent: true },
      )
      if (!valid() || controller.signal.aborted) return
      check(row, selected, operation.pageId)
      // A successful replay may return a newer current row. Only the write receipt confirms our save.
      adopt(row)
      unknown.value = conflict.value = false
      pending = undefined
      notice.value = t('proto.deliverySaved')
      void loadList()
    } catch (cause) {
      if (!valid() || controller.signal.aborted) return
      if (rejectAccess(cause)) return
      if (cause instanceof ApiError && cause.status === 409) {
        unknown.value = false
        conflict.value = true
        pending = undefined
        notice.value = t('proto.deliveryConflict')
      } else if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        unknown.value = false
        pending = undefined
        notice.value = t(
          cause.code === 'PROTOTYPE_HUB_PAGE_DELIVERY_ASSIGNEE_INVALID'
            ? 'proto.deliveryUnavailableHint'
            : 'proto.deliveryRejected',
        )
      } else {
        unknown.value = true
        notice.value = t('proto.deliveryUnknown')
      }
    } finally {
      if (valid()) busy.value = false
    }
  }
  function save() {
    if (!canEdit.value || !current.value || busy.value || unknown.value || conflict.value) return
    if (
      !form.state ||
      !deliveryStates.includes(form.state) ||
      form.reason.length > 2000 ||
      unavailableAssignee.value
    ) {
      invalid.value = t('proto.deliveryInvalid')
      return
    }
    void write({
      pageId: current.value.pageId,
      input: {
        revisionId: current.value.revisionId,
        state: form.state,
        assigneeId: form.assigneeId || null,
        reason: form.reason,
        expectedVersion: current.value.configVersion,
        clientRequestId: secureId(),
      },
    })
  }
  function retry() {
    if (unknown.value && pending && !busy.value) void write(pending)
  }
  function discard() {
    if (!busy.value && !unknown.value && current.value) {
      adopt(current.value)
      conflict.value = false
      invalid.value = notice.value = ''
    }
  }
  watch(
    () =>
      JSON.stringify(
        target.value && {
          actor: target.value.actorId,
          project: target.value.project.id,
          revision: target.value.revision.id,
          version: target.value.revision.versionId,
          edit: editAccess.value,
        },
      ),
    () => {
      reset()
      if (scope.value && !target.value) {
        unavailable.value = true
        error.value = t('proto.deliveryUnavailable')
      } else {
        void loadList()
        selectPage(initialPage.value || '')
      }
    },
    { immediate: true, flush: 'sync' },
  )
  // External scope changes cannot retain the previous page's draft or pending request.
  watch(
    initialPage,
    (value) => {
      reset()
      void loadList()
      selectPage(value || '')
    },
    { flush: 'sync' },
  )
  onScopeDispose(reset)
  return {
    target,
    canEdit,
    unavailable,
    rows,
    current,
    selectedPageId,
    filter,
    pageIndex,
    total,
    loading,
    detailLoading,
    busy,
    error,
    detailError,
    notice,
    invalid,
    unknown,
    conflict,
    form,
    dirty,
    unavailableAssignee,
    candidates,
    candidateKeyword,
    candidateIndex,
    candidateTotal,
    candidatesLoading,
    candidateError,
    loadList,
    loadDetail,
    loadCandidates,
    selectPage,
    changeFilter,
    page,
    searchCandidates,
    candidatePage,
    save,
    retry,
    discard,
  }
}
