import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { usePermissions } from '@/shared/auth/provider'
import { ApiError } from '@/shared/api/errors'
import { secureId } from '@/shared/utils/secure-id'
import { t } from '@/shared/i18n'
import { reviewAssociationsApi } from '../api/review-association'
import { reviewGuestsApi } from '../api/review-guest'
import { protoPermissions as p } from '../routes/permissions'
import { projectAllows } from '../utils/project-access'
import type {
  Project,
  ReviewThread,
  ReviewAssociation,
  ReviewAssociationContext,
  ReviewGuest,
  ReviewAssociationCreateInput,
  ReviewAssociationRevokeInput,
} from '../types'

type Pending =
  | { kind: 'create'; input: ReviewAssociationCreateInput }
  | { kind: 'revoke'; id: string; input: ReviewAssociationRevokeInput }
/** One exact source scope. Unknown writes retain the original payload/key until explicit recovery. */
export function useReviewAssociations(
  project: Ref<Project | undefined>,
  source: Ref<ReviewThread | undefined>,
  open: Ref<boolean>,
  actor: Ref<string>,
) {
  const permissions = usePermissions()
  const readable = computed(
    () =>
      !!actor.value &&
      projectAllows(project.value, 'manageMembers') &&
      source.value?.verificationLevel === 'unverified' &&
      permissions.can(p.project.query),
  )
  const editable = computed(() => readable.value && permissions.can(p.project.save))
  const context = shallowRef<ReviewAssociationContext>()
  const history = shallowRef<ReviewAssociation[]>([]),
    candidates = shallowRef<ReviewGuest[]>([])
  const selected = shallowRef<ReviewGuest>()
  const historyTotal = ref(0),
    historyPage = ref(0),
    candidateTotal = ref(0),
    candidatePage = ref(0)
  const loading = ref(false),
    searching = ref(false),
    busy = ref(false),
    error = ref(''),
    notice = ref('')
  const candidateError = ref(''),
    evidence = ref(''),
    reason = ref(''),
    confirmed = ref(false)
  const mode = ref<'overview' | 'create' | 'revoke'>('overview')
  const pending = shallowRef<Pending>()
  const unknown = computed(() => !!pending.value && !busy.value)
  let generation = 0,
    querySequence = 0,
    candidateSequence = 0
  let queryController: AbortController | undefined,
    candidateController: AbortController | undefined,
    writeController: AbortController | undefined
  function reset() {
    generation++
    querySequence++
    candidateSequence++
    queryController?.abort()
    candidateController?.abort()
    writeController?.abort()
    context.value = undefined
    history.value = []
    candidates.value = []
    selected.value = undefined
    historyTotal.value = candidateTotal.value = historyPage.value = candidatePage.value = 0
    loading.value = searching.value = busy.value = false
    error.value = notice.value = candidateError.value = evidence.value = reason.value = ''
    confirmed.value = false
    pending.value = undefined
    mode.value = 'overview'
  }
  function denied() {
    reset()
    error.value = t('proto.associationAccessChanged')
  }
  function isDenied(cause: unknown) {
    return cause instanceof ApiError && [401, 403, 404].includes(cause.status)
  }
  async function load(page = historyPage.value) {
    if (!open.value || !readable.value || !project.value || !source.value || busy.value) return
    const epoch = generation,
      sequence = ++querySequence,
      target = source.value
    queryController?.abort()
    const request = new AbortController()
    queryController = request
    loading.value = true
    error.value = ''
    const options = { signal: request.signal, silent: true }
    try {
      const [detail, rows] = await Promise.all([
        reviewAssociationsApi.detail(project.value.id, target.id, options),
        reviewAssociationsApi.query(
          project.value.id,
          { sourceThreadId: target.id, pageIndex: page, pageSize: 20 },
          options,
        ),
      ])
      if (epoch !== generation || sequence !== querySequence || request.signal.aborted) return
      if (detail.sourceThread.id !== target.id || detail.revisionId !== target.revisionId)
        throw new ApiError('Invalid source scope', 404)
      context.value = detail
      history.value = rows.data
      historyTotal.value = rows.total
      historyPage.value = page
    } catch (cause) {
      if (epoch !== generation || sequence !== querySequence || request.signal.aborted) return
      if (isDenied(cause)) denied()
      else {
        context.value = undefined
        history.value = []
        error.value = t('proto.associationLoadFailed')
      }
    } finally {
      if (epoch === generation && sequence === querySequence) loading.value = false
    }
  }
  async function targets(page = 0) {
    if (!open.value || !editable.value || !project.value || busy.value || unknown.value) return
    const epoch = generation,
      sequence = ++candidateSequence
    candidateController?.abort()
    const request = new AbortController()
    candidateController = request
    searching.value = true
    candidateError.value = ''
    candidates.value = []
    try {
      const result = await reviewGuestsApi.query(
        project.value.id,
        {
          verificationLevel: 'email',
          pageIndex: page,
          pageSize: 20,
        },
        { signal: request.signal, silent: true },
      )
      if (epoch !== generation || sequence !== candidateSequence || request.signal.aborted) return
      if (result.data.some((row) => row.verificationLevel !== 'email'))
        throw new ApiError('Invalid candidates')
      candidates.value = result.data
      candidateTotal.value = result.total
      candidatePage.value = page
    } catch (cause) {
      if (epoch !== generation || sequence !== candidateSequence || request.signal.aborted) return
      if (isDenied(cause)) denied()
      else candidateError.value = t('proto.associationTargetsFailed')
    } finally {
      if (epoch === generation && sequence === candidateSequence) searching.value = false
    }
  }
  function select(guest: ReviewGuest) {
    if (
      busy.value ||
      unknown.value ||
      !editable.value ||
      !candidates.value.includes(guest) ||
      !guest.enabled
    )
      return
    selected.value = guest
    confirmed.value = false
  }
  function edit(next: 'create' | 'revoke') {
    if (!editable.value || busy.value || unknown.value || !context.value || loading.value) return
    if (next === 'create' && (!context.value.eligible || context.value.activeAssociation)) return
    if (next === 'revoke' && !context.value.activeAssociation) return
    mode.value = next
    notice.value = ''
    confirmed.value = false
    if (next === 'create') void targets()
  }
  function cancel() {
    if (busy.value || unknown.value) return
    mode.value = 'overview'
    confirmed.value = false
  }
  async function write(operation: Pending) {
    if (!open.value || !editable.value || !project.value || busy.value) return
    const epoch = generation,
      request = new AbortController()
    queryController?.abort()
    querySequence++
    loading.value = false
    writeController = request
    pending.value = operation
    busy.value = true
    notice.value = ''
    try {
      const options = { signal: request.signal, silent: true }
      if (operation.kind === 'create')
        await reviewAssociationsApi.create(project.value.id, operation.input, options)
      else
        await reviewAssociationsApi.revoke(project.value.id, operation.id, operation.input, options)
      if (epoch !== generation || request.signal.aborted) return
      pending.value = undefined
      mode.value = 'overview'
      confirmed.value = false
      evidence.value = reason.value = ''
      selected.value = undefined
      notice.value = t(
        operation.kind === 'create' ? 'proto.associationCreated' : 'proto.associationRevoked',
      )
      busy.value = false
      await load(0)
    } catch (cause) {
      if (epoch !== generation || request.signal.aborted) return
      if (isDenied(cause)) denied()
      else if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        pending.value = undefined
        confirmed.value = false
        busy.value = false
        if (cause.status === 409) {
          mode.value = 'overview'
          selected.value = undefined
          await load(0)
          if (epoch === generation) notice.value = t('proto.associationConflict')
        } else notice.value = t('proto.associationWriteFailed')
      } else notice.value = t('proto.associationUnknown')
    } finally {
      if (epoch === generation) busy.value = false
    }
  }
  function save() {
    if (
      busy.value ||
      unknown.value ||
      !editable.value ||
      !context.value ||
      loading.value ||
      !confirmed.value
    )
      return
    if (mode.value === 'create') {
      const target = selected.value,
        detail = context.value,
        basis = evidence.value.trim()
      if (
        !target?.enabled ||
        target.verificationLevel !== 'email' ||
        !detail.eligible ||
        detail.activeAssociation ||
        detail.shareConfigVersion === null ||
        !basis ||
        basis.length > 1000
      )
        return
      void write({
        kind: 'create',
        input: {
          sourceThreadId: detail.sourceThread.id,
          targetGuestId: target.id,
          expectedShareVersion: detail.shareConfigVersion,
          expectedTargetVersion: target.configVersion,
          evidenceReference: basis,
          clientRequestId: secureId(),
        },
      })
    } else if (mode.value === 'revoke') {
      const relation = context.value.activeAssociation,
        basis = reason.value.trim()
      if (!relation || !basis || basis.length > 1000) return
      void write({
        kind: 'revoke',
        id: relation.id,
        input: {
          expectedVersion: relation.configVersion,
          reason: basis,
          clientRequestId: secureId(),
        },
      })
    }
  }
  function retry() {
    if (pending.value && !busy.value) void write(pending.value)
  }
  watch(
    () => [
      open.value,
      project.value?.id,
      source.value?.id,
      actor.value,
      readable.value,
      editable.value,
    ],
    () => {
      reset()
      if (open.value && readable.value) void load(0)
      else if (open.value) error.value = t('proto.associationAccessChanged')
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(reset)
  return {
    readable,
    editable,
    context,
    history,
    historyTotal,
    historyPage,
    candidates,
    candidateTotal,
    candidatePage,
    selected,
    loading,
    searching,
    busy,
    error,
    notice,
    candidateError,
    evidence,
    reason,
    confirmed,
    mode,
    unknown,
    load,
    targets,
    select,
    edit,
    cancel,
    save,
    retry,
  }
}
export type ReviewAssociationsController = ReturnType<typeof useReviewAssociations>
