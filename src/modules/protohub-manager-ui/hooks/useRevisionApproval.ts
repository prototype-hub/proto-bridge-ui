import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { revisionApprovalApi as api } from '../api/revision-approval'
import type {
  ApprovalAction,
  ApprovalEvent,
  ApprovalInput,
  RevisionApproval,
} from '../types/revision-approval'
import type { Project, Revision } from '../types'
import { usePermissions } from '@/shared/auth/provider'
import { token } from '@/shared/auth/token'
import { protoPermissions as p } from '../routes/permissions'
import { projectAllows } from '../utils/project-access'
import { secureId } from '@/shared/utils/secure-id'
import { ApiError } from '@/shared/api/errors'
import { t } from '@/shared/i18n'

export interface ApprovalScope {
  actorId: string
  project: Project
  revision: Revision
}
export function approvalAllowed(status: RevisionApproval, action: ApprovalAction) {
  return action === 'approve'
    ? !status.approved
    : action === 'revoke'
      ? status.approved
      : action === 'publish'
        ? status.approved && !status.published
        : status.published
}
export function useRevisionApproval(scope: Ref<ApprovalScope | undefined>) {
  const permissions = usePermissions()
  const target = computed(() => {
    const s = scope.value
    return s?.actorId &&
      s.revision.id &&
      s.revision.versionId &&
      s.project.id === s.revision.projectId &&
      projectAllows(s.project, 'read') &&
      permissions.can(p.version.query)
      ? s
      : undefined
  })
  const editAccess = computed(
    () =>
      !!target.value &&
      projectAllows(target.value.project, 'edit') &&
      permissions.can(p.version.save),
  )
  const current = shallowRef<RevisionApproval>(),
    rows = shallowRef<ApprovalEvent[]>([])
  const loading = ref(false),
    historyLoading = ref(false),
    busy = ref(false),
    unavailable = ref(false)
  const error = ref(''),
    historyError = ref(''),
    notice = ref(''),
    invalid = ref(''),
    note = ref('')
  const unknown = ref(false),
    conflict = ref(false),
    historyOpen = ref(false),
    pageIndex = ref(0),
    total = ref(0)
  const canEdit = computed(() => editAccess.value && !unavailable.value)
  let scopeCredential = token.get()
  let generation = 0,
    readSerial = 0,
    historySerial = 0
  let reader: AbortController | undefined,
    historian: AbortController | undefined,
    writer: AbortController | undefined
  let pending: Readonly<ApprovalInput> | undefined
  function reset() {
    scopeCredential = token.get()
    generation++
    reader?.abort()
    historian?.abort()
    writer?.abort()
    current.value = undefined
    rows.value = []
    pending = undefined
    note.value = error.value = historyError.value = notice.value = invalid.value = ''
    loading.value =
      historyLoading.value =
      busy.value =
      unavailable.value =
      unknown.value =
      conflict.value =
      historyOpen.value =
        false
    pageIndex.value = total.value = 0
  }
  function deny(cause: unknown) {
    if (!(cause instanceof ApiError) || ![401, 403, 404].includes(cause.status)) return false
    reset()
    unavailable.value = true
    error.value = t('proto.approvalUnavailable')
    return true
  }
  function credentialCurrent() {
    if (scopeCredential === token.get()) return true
    reset()
    unavailable.value = true
    error.value = t('proto.approvalUnavailable')
    return false
  }
  const checkCredential = () => {
    credentialCurrent()
  }
  window.addEventListener('storage', checkCredential)
  window.addEventListener('focus', checkCredential)
  function context() {
    const epoch = generation,
      credential = scopeCredential
    return () => {
      if (epoch !== generation) return false
      if (credential !== token.get()) {
        reset()
        unavailable.value = true
        error.value = t('proto.approvalUnavailable')
        return false
      }
      return true
    }
  }
  function check<
    T extends { projectId: string; versionId: string; revisionId: string; configVersion: number },
  >(row: T, selected: ApprovalScope): T {
    if (
      row.projectId !== selected.project.id ||
      row.versionId !== selected.revision.versionId ||
      row.revisionId !== selected.revision.id ||
      !Number.isSafeInteger(row.configVersion) ||
      row.configVersion < 0
    )
      throw new ApiError(t('proto.approvalUnavailable'), 404)
    return row
  }
  async function load(keepNote = true) {
    const selected = target.value
    if (!selected || !credentialCurrent() || unavailable.value || busy.value) return
    reader?.abort()
    const controller = (reader = new AbortController()),
      serial = ++readSerial,
      valid = context()
    loading.value = true
    error.value = ''
    try {
      const row = await api.get(selected.revision.versionId, selected.revision.id, {
        signal: controller.signal,
        silent: true,
      })
      if (!valid() || serial !== readSerial || controller.signal.aborted) return
      current.value = check(row, selected)
      if (!keepNote) note.value = ''
      if (conflict.value && !unknown.value) {
        conflict.value = false
        notice.value = t('proto.approvalRefreshed')
      }
    } catch (cause) {
      if (!valid() || serial !== readSerial || controller.signal.aborted) return
      if (!deny(cause)) error.value = t('proto.approvalLoadFailed')
    } finally {
      if (valid() && serial === readSerial) loading.value = false
    }
  }
  async function loadHistory() {
    const selected = target.value
    if (!selected || !credentialCurrent() || unavailable.value || !historyOpen.value) return
    historian?.abort()
    const controller = (historian = new AbortController()),
      serial = ++historySerial,
      valid = context()
    historyLoading.value = true
    historyError.value = ''
    try {
      const result = await api.history(
        selected.revision.versionId,
        selected.revision.id,
        { pageIndex: pageIndex.value, pageSize: 10 },
        { signal: controller.signal, silent: true },
      )
      if (!valid() || serial !== historySerial || controller.signal.aborted) return
      rows.value = result.data.map((row) => check(row, selected))
      total.value = result.total
    } catch (cause) {
      if (!valid() || serial !== historySerial || controller.signal.aborted) return
      if (!deny(cause)) {
        rows.value = []
        total.value = 0
        historyError.value = t('proto.approvalLoadFailed')
      }
    } finally {
      if (valid() && serial === historySerial) historyLoading.value = false
    }
  }
  async function write(input: Readonly<ApprovalInput>) {
    const selected = target.value
    if (!selected || !credentialCurrent() || !canEdit.value || busy.value) return
    reader?.abort()
    readSerial++
    loading.value = false
    const controller = (writer = new AbortController()),
      valid = context()
    pending = input
    busy.value = true
    notice.value = invalid.value = ''
    try {
      const row = await api.act(selected.revision.versionId, selected.revision.id, input, {
        signal: controller.signal,
        silent: true,
      })
      if (!valid() || controller.signal.aborted) return
      // A replay returns current state; the historical action is never promoted to active state.
      current.value = check(row, selected)
      pending = undefined
      unknown.value = conflict.value = false
      note.value = ''
      notice.value = t('proto.approvalSaved')
      pageIndex.value = 0
      void loadHistory()
    } catch (cause) {
      if (!valid() || controller.signal.aborted) return
      if (deny(cause)) return
      if (cause instanceof ApiError && cause.status === 409) {
        pending = undefined
        unknown.value = false
        conflict.value = true
        notice.value = t('proto.approvalConflict')
      } else if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        pending = undefined
        unknown.value = false
        notice.value = t('proto.approvalRejected')
      } else {
        unknown.value = true
        notice.value = t('proto.approvalUnknown')
      }
    } finally {
      if (valid()) busy.value = false
    }
  }
  function act(action: ApprovalAction) {
    if (
      !canEdit.value ||
      !current.value ||
      busy.value ||
      loading.value ||
      unknown.value ||
      conflict.value ||
      !approvalAllowed(current.value, action)
    )
      return
    if (note.value.length > 2000) {
      invalid.value = t('proto.approvalInvalid')
      return
    }
    return write(
      Object.freeze({
        action,
        expectedVersion: current.value.configVersion,
        clientRequestId: secureId(),
        note: note.value,
      }),
    )
  }
  function retry() {
    if (unknown.value && pending && !busy.value) return write(pending)
  }
  function page(value: number) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 10001) return
    pageIndex.value = value - 1
    void loadHistory()
  }
  watch(
    () =>
      JSON.stringify(
        target.value && {
          actor: target.value.actorId,
          project: target.value.project.id,
          version: target.value.revision.versionId,
          revision: target.value.revision.id,
          edit: editAccess.value,
        },
      ),
    () => {
      reset()
      if (scope.value && !target.value) {
        unavailable.value = true
        error.value = t('proto.approvalUnavailable')
      } else void load()
    },
    { immediate: true, flush: 'sync' },
  )
  watch(historyOpen, (open) => {
    if (open) void loadHistory()
  })
  onScopeDispose(() => {
    window.removeEventListener('storage', checkCredential)
    window.removeEventListener('focus', checkCredential)
    reset()
  })
  return {
    target,
    current,
    rows,
    loading,
    historyLoading,
    busy,
    unavailable,
    canEdit,
    error,
    historyError,
    notice,
    invalid,
    note,
    unknown,
    conflict,
    historyOpen,
    pageIndex,
    total,
    load,
    loadHistory,
    page,
    act,
    retry,
  }
}
