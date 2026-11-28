import { computed, onScopeDispose, reactive, ref, shallowRef, watch, type Ref } from 'vue'
import { ApiError } from '@/shared/api/errors'
import { usePermissions } from '@/shared/auth/provider'
import { token } from '@/shared/auth/token'
import { secureId } from '@/shared/utils/secure-id'
import { download } from '@/shared/api/client'
import type { PageResult } from '@/shared/api/types'
import { t } from '@/shared/i18n'
import { protoPermissions as p } from '../routes/permissions'
import { projectAllows } from '../utils/project-access'
import { flattenPages, selectablePage, stablePageId } from '../utils/preview-location'
import {
  blankStudy,
  blankStudyAnswers,
  copyStudy,
  taskFromScript,
  validStudy,
  validStudyAnswers,
} from '../utils/usability-study'
import { usabilityStudyApi as api } from '../api/usability-study'
import { demoScriptApi } from '../api/demo-script'
import type { ReviewContext } from '../types'
import type { DemoScriptSummary } from '../types/demo-script'
import type {
  Study,
  StudyScope,
  StudySummary,
  PublicStudy,
  PublicStudySummary,
  StudyDefinition,
  StudyMutation,
  ParticipationInput,
  OwnStudyResponse,
  StudyAggregate,
  MemberStudyResponse,
} from '../types/usability-study'

type Operation =
  | { kind: 'create'; input: StudyDefinition & { clientRequestId: string } }
  | { kind: 'update'; id: string; input: StudyDefinition & StudyMutation }
  | { kind: 'open' | 'close' | 'delete'; id: string; input: StudyMutation }
  | {
      kind: 'consent' | 'progress' | 'submit' | 'withdraw'
      id: string
      input: ParticipationInput
      csrf: string
    }
const participantActions = new Set(['consent', 'progress', 'submit', 'withdraw'])
function frozen<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T
  function freeze(item: unknown) {
    if (item && typeof item === 'object') {
      Object.values(item).forEach(freeze)
      Object.freeze(item)
    }
  }
  freeze(copy)
  return copy
}
function pager<T>(
  value: { data: T[]; total: number; pageIndex: number; pageSize: number },
  index: number,
) {
  if (
    !value ||
    !Array.isArray(value.data) ||
    value.data.length > 20 ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0 ||
    value.pageIndex !== index ||
    value.pageSize !== 20
  )
    throw new ApiError('Unavailable', 404)
  return value
}
/** The shell owns consent, scoped drafts and exact unknown-write retries; the frame only opens pages. */
export function useUsabilityStudies(
  scope: Ref<StudyScope | undefined>,
  identity: Ref<ReviewContext | undefined> = ref(),
) {
  const permissions = usePermissions()
  const denied = ref(false)
  const authorized = computed(() => {
    const value = scope.value
    if (!value?.context.revisionId) return undefined
    if (value.kind === 'public')
      return value.share.reviewEnabled &&
        value.share.accessKey &&
        value.share.revisionId === value.context.revisionId
        ? value
        : undefined
    return value.actorId &&
      value.project.id === value.revision.projectId &&
      value.revision.id === value.context.revisionId &&
      projectAllows(value.project, 'read') &&
      permissions.can(p.version.query)
      ? value
      : undefined
  })
  const isPublic = computed(() => scope.value?.kind === 'public')
  const canEdit = computed(() => {
    const value = authorized.value
    return (
      value?.kind === 'member' &&
      !denied.value &&
      projectAllows(value.project, 'edit') &&
      permissions.can(p.version.save)
    )
  })
  const identified = computed(() => {
    const value = authorized.value
    return value?.kind === 'public' &&
      identity.value?.enabled &&
      identity.value.revisionId === value.share.revisionId &&
      identity.value.session &&
      identity.value.session.expiresAt > Date.now() &&
      identity.value.csrfToken
      ? true
      : false
  })
  const pages = computed(() =>
    authorized.value
      ? flattenPages(authorized.value.context.pages).flatMap((page) => {
          const pageId = stablePageId(page, authorized.value!.context.pages)
          return pageId && selectablePage(page, authorized.value!.context.runtimeBaseUrl)
            ? [{ pageId, name: page.name, path: page.path! }]
            : []
        })
      : [],
  )
  const pageIds = computed(() => new Set(pages.value.map((page) => page.pageId)))
  const form = reactive<StudyDefinition>(blankStudy()),
    answers = reactive(blankStudyAnswers())
  const baseline = ref(JSON.stringify(form)),
    answerBaseline = ref(JSON.stringify(answers))
  const original = shallowRef<Study | PublicStudy>(),
    own = shallowRef<OwnStudyResponse | null>(null)
  const rows = shallowRef<(StudySummary | PublicStudySummary)[]>([]),
    scripts = shallowRef<DemoScriptSummary[]>([])
  const aggregate = shallowRef<StudyAggregate>(),
    responses = shallowRef<MemberStudyResponse[]>([])
  const pageIndex = ref(0),
    total = ref(0),
    responsePage = ref(0),
    responseTotal = ref(0),
    scriptPage = ref(0),
    scriptTotal = ref(0)
  const mode = ref<'list' | 'edit' | 'preview' | 'participate' | 'results'>('list')
  const loading = ref(false),
    busy = ref(false),
    unknown = ref(false),
    conflict = ref(false),
    invalid = ref(false)
  const error = ref(''),
    notice = ref('')
  const locked = computed(() => busy.value || unknown.value)
  const editable = computed(
    () => canEdit.value && (!original.value || original.value.state === 'draft'),
  )
  const answerable = computed(
    () => identified.value && own.value?.status === 'draft' && original.value?.state === 'open',
  )
  const dirty = computed(
    () =>
      (editable.value && mode.value !== 'list' && JSON.stringify(form) !== baseline.value) ||
      (answerable.value && JSON.stringify(answers) !== answerBaseline.value),
  )
  let epoch = 0,
    sequence = 0,
    credential = token.get()
  let reader: AbortController | undefined,
    writer: AbortController | undefined,
    pending: Operation | undefined
  function clear() {
    epoch++
    sequence++
    reader?.abort()
    writer?.abort()
    pending = undefined
    rows.value = []
    scripts.value = []
    responses.value = []
    aggregate.value = undefined
    original.value = undefined
    own.value = null
    Object.assign(form, blankStudy())
    Object.assign(answers, blankStudyAnswers())
    baseline.value = JSON.stringify(form)
    answerBaseline.value = JSON.stringify(answers)
    pageIndex.value =
      total.value =
      responsePage.value =
      responseTotal.value =
      scriptPage.value =
      scriptTotal.value =
        0
    mode.value = 'list'
    loading.value =
      busy.value =
      unknown.value =
      conflict.value =
      invalid.value =
      denied.value =
        false
    error.value = notice.value = ''
  }
  function revoke() {
    clear()
    denied.value = true
    error.value = t('proto.studyUnavailable')
  }
  function current(generation: number) {
    if (generation !== epoch) return false
    if (!isPublic.value && credential !== token.get()) {
      revoke()
      return false
    }
    return true
  }
  function grant() {
    const selected = authorized.value
    if (selected?.kind !== 'public') throw new ApiError('Unavailable', 403)
    return {
      token: selected.share.token,
      revisionId: selected.share.revisionId!,
      accessKey: selected.share.accessKey!,
    }
  }
  function checkStudy(value: Study | PublicStudy, id: string) {
    if (
      !value ||
      value.id !== id ||
      !['draft', 'open', 'closed'].includes(value.state) ||
      !validStudy(value, pageIds.value, value.state !== 'draft')
    )
      throw new ApiError('Unavailable', 404)
    const selected = authorized.value
    if (
      selected?.kind === 'member' &&
      (!('revisionId' in value) ||
        value.revisionId !== selected.revision.id ||
        value.versionId !== selected.revision.versionId ||
        value.projectId !== selected.project.id ||
        !Number.isSafeInteger(value.configVersion))
    )
      throw new ApiError('Unavailable', 404)
    if (
      selected?.kind === 'public' &&
      (!['open', 'closed'].includes(value.state) || !Number.isSafeInteger(value.contentVersion))
    )
      throw new ApiError('Unavailable', 404)
  }
  function acceptOwn(value: OwnStudyResponse | null) {
    if (
      value &&
      (!original.value ||
        value.contentVersion !== original.value.contentVersion ||
        !Number.isSafeInteger(value.configVersion) ||
        !['draft', 'submitted', 'withdrawn'].includes(value.status) ||
        !validStudyAnswers(value, original.value, value.status === 'submitted'))
    )
      throw new Error('Invalid participation')
    own.value = value
    Object.assign(
      answers,
      value
        ? {
            taskAnswers: value.taskAnswers.map((answer) => ({ ...answer })),
            answers: value.answers.map((answer) => ({ ...answer })),
            feedback: value.feedback,
          }
        : blankStudyAnswers(),
    )
    answerBaseline.value = JSON.stringify(answers)
  }
  function apply(value: Study | PublicStudy) {
    original.value = value
    Object.assign(form, copyStudy(value))
    baseline.value = JSON.stringify(form)
    invalid.value = false
  }
  function failure(cause: unknown) {
    if (cause instanceof ApiError && [401, 403].includes(cause.status)) revoke()
    else
      error.value = t(
        cause instanceof ApiError && cause.status === 404
          ? 'proto.studyUnavailable'
          : 'proto.studyLoadFailed',
      )
  }
  async function read<T>(
    action: (selected: StudyScope, signal: AbortSignal) => Promise<T>,
    accept: (value: T) => void,
  ) {
    if (!current(epoch) || !authorized.value || denied.value || locked.value) return false
    reader?.abort()
    const selected = authorized.value,
      generation = epoch,
      serial = ++sequence,
      request = (reader = new AbortController())
    loading.value = true
    error.value = ''
    reader = request
    try {
      const value = await action(selected, request.signal)
      if (!current(generation) || serial !== sequence || request.signal.aborted) return false
      accept(value)
      return true
    } catch (cause) {
      if (current(generation) && serial === sequence && !request.signal.aborted) failure(cause)
      return false
    } finally {
      if (current(generation) && serial === sequence) loading.value = false
    }
  }
  function load(index = pageIndex.value) {
    return read<PageResult<StudySummary | PublicStudySummary>>(
      (selected, signal) =>
        selected.kind === 'public'
          ? api.publicQuery(grant(), index, signal)
          : api.query(selected.revision.versionId, selected.revision.id, index, {
              signal,
              silent: true,
            }),
      (result) => {
        const value = pager(result, index)
        if (
          value.data.some(
            (row) =>
              !row ||
              typeof row.id !== 'string' ||
              typeof row.title !== 'string' ||
              !['draft', 'open', 'closed'].includes(row.state),
          )
        )
          throw new ApiError('Unavailable', 404)
        rows.value = value.data
        total.value = value.total
        pageIndex.value = index
      },
    )
  }
  async function open(id: string, refresh = false) {
    return read(
      async (selected, signal) =>
        selected.kind === 'public'
          ? api.context(grant(), id, signal)
          : {
              study: await api.get(selected.revision.versionId, selected.revision.id, id, {
                signal,
                silent: true,
              }),
              participation: null,
            },
      (value) => {
        checkStudy(value.study, id)
        if (
          refresh &&
          isPublic.value &&
          value.participation?.status === 'draft' &&
          value.study.state === 'open'
        ) {
          original.value = value.study
          own.value = value.participation
          conflict.value = false
          notice.value = t('proto.studyRefreshed')
          return
        }
        if (refresh && value.study.state === 'draft') {
          original.value = value.study
          conflict.value = false
          notice.value = t('proto.studyRefreshed')
          return
        }
        apply(value.study)
        if (isPublic.value) {
          acceptOwn(value.participation)
          mode.value = 'participate'
        } else mode.value = value.study.state === 'draft' && canEdit.value ? 'edit' : 'preview'
        conflict.value = false
      },
    )
  }
  function create() {
    if (!canEdit.value || locked.value) return
    original.value = undefined
    Object.assign(form, blankStudy())
    baseline.value = JSON.stringify(form)
    mode.value = 'edit'
    invalid.value = conflict.value = false
    error.value = notice.value = ''
  }
  async function execute(operation: Operation) {
    if (!current(epoch) || !authorized.value || busy.value) return
    const selected = authorized.value,
      participant = participantActions.has(operation.kind)
    if (
      participant
        ? selected.kind !== 'public' || !identified.value
        : selected.kind !== 'member' || !canEdit.value
    )
      return
    let missing = false
    const generation = epoch,
      request = (writer = new AbortController())
    reader?.abort()
    sequence++
    loading.value = false
    busy.value = true
    pending = operation
    error.value = notice.value = ''
    try {
      const options = { signal: request.signal, silent: true }
      if (selected.kind === 'public' && 'csrf' in operation) {
        const result = await api.participate(
          grant(),
          operation.id,
          operation.kind,
          operation.input,
          operation.csrf,
          request.signal,
        )
        if (!current(generation) || request.signal.aborted) return
        if (result.status === 'missing' && result.participation === null) {
          missing = true
          own.value = null
          original.value = undefined
          Object.assign(answers, blankStudyAnswers())
          answerBaseline.value = JSON.stringify(answers)
          mode.value = 'list'
        } else if (result.status === 'current' && result.participation)
          acceptOwn(result.participation)
        else throw new Error('Invalid mutation receipt')
      } else if (selected.kind === 'member' && !('csrf' in operation)) {
        const version = selected.revision.versionId,
          revision = selected.revision.id
        const result =
          operation.kind === 'create'
            ? await api.create(version, revision, operation.input, options)
            : operation.kind === 'update'
              ? await api.update(version, revision, operation.id, operation.input, options)
              : await api.action(
                  version,
                  revision,
                  operation.id,
                  operation.kind,
                  operation.input,
                  options,
                )
        if (!current(generation) || request.signal.aborted) return
        if (operation.kind === 'delete') {
          if (result !== true) throw new Error('Invalid deletion receipt')
          original.value = undefined
          mode.value = 'list'
          Object.assign(form, blankStudy())
          baseline.value = JSON.stringify(form)
        } else {
          if (typeof result === 'boolean') throw new Error('Invalid mutation receipt')
          checkStudy(result, operation.kind === 'create' ? result.id : operation.id)
          apply(result)
          mode.value = result.state === 'draft' ? 'edit' : 'preview'
        }
      }
      pending = undefined
      unknown.value = conflict.value = false
      notice.value = t(missing ? 'proto.studyRemoved' : `proto.studyDone_${operation.kind}`)
    } catch (cause) {
      if (!current(generation) || request.signal.aborted) return
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) revoke()
      else if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        pending = undefined
        unknown.value = false
        conflict.value = cause.status === 409
        error.value = t(conflict.value ? 'proto.studyConflict' : 'proto.studyRejected')
      } else {
        unknown.value = true
        error.value = t('proto.studyUnknown')
      }
    } finally {
      if (current(generation)) busy.value = false
    }
    if (
      current(generation) &&
      !unknown.value &&
      !conflict.value &&
      !denied.value &&
      mode.value === 'list'
    )
      void load()
  }
  function save() {
    if (!editable.value || locked.value || conflict.value) return
    invalid.value = !validStudy(form, pageIds.value)
    if (invalid.value) return
    const input = frozen({ ...copyStudy(form), clientRequestId: secureId() })
    return execute(
      original.value && 'configVersion' in original.value
        ? {
            kind: 'update',
            id: original.value.id,
            input: frozen({ ...input, expectedVersion: original.value.configVersion }),
          }
        : { kind: 'create', input },
    )
  }
  function action(kind: 'open' | 'close' | 'delete') {
    const value = original.value
    if (!canEdit.value || locked.value || conflict.value || !value || !('configVersion' in value))
      return
    if (kind === 'open' && (!validStudy(form, pageIds.value, true) || dirty.value)) {
      invalid.value = true
      return
    }
    return execute({
      kind,
      id: value.id,
      input: frozen({ expectedVersion: value.configVersion, clientRequestId: secureId() }),
    })
  }
  function participate(kind: 'consent' | 'progress' | 'submit' | 'withdraw') {
    const value = original.value
    if (
      !identified.value ||
      !value ||
      value.contentVersion === null ||
      value.contentVersion === undefined ||
      locked.value ||
      conflict.value
    )
      return
    if ((kind === 'progress' || kind === 'submit') && !answerable.value) return
    if (kind === 'consent' && (own.value || value.state !== 'open')) return
    if (kind === 'withdraw' && (!own.value || own.value.status === 'withdrawn')) return
    if (kind === 'progress' || kind === 'submit') {
      invalid.value = !validStudyAnswers(answers, value, kind === 'submit')
      if (invalid.value) return
    }
    const input: ParticipationInput = {
      contentVersion: value.contentVersion,
      clientRequestId: secureId(),
      ...(kind === 'consent'
        ? { agreed: true as const }
        : { expectedVersion: own.value!.configVersion }),
      ...(kind === 'progress' || kind === 'submit' ? JSON.parse(JSON.stringify(answers)) : {}),
    }
    return execute({ kind, id: value.id, input: frozen(input), csrf: identity.value!.csrfToken })
  }
  function retry() {
    if (unknown.value && pending && !busy.value) return execute(pending)
  }
  async function results(index = 0) {
    const id = original.value?.id
    if (!id || isPublic.value) return
    return read(
      async (selected, signal) => {
        if (selected.kind !== 'member') throw new Error('Unavailable')
        const options = { signal, silent: true }
        return Promise.all([
          api.summary(selected.revision.versionId, selected.revision.id, id, options),
          api.responses(selected.revision.versionId, selected.revision.id, id, index, options),
        ])
      },
      ([summary, result]) => {
        pager(result, index)
        if (
          result.data.some(
            (row) =>
              row.status !== 'submitted' ||
              row.contentVersion !== original.value?.contentVersion ||
              !validStudyAnswers(row, form, true),
          )
        )
          throw new Error('Invalid submitted response')
        if (
          !Number.isSafeInteger(summary.submittedCount) ||
          summary.submittedCount < 0 ||
          summary.submittedCount > 200 ||
          !Array.isArray(summary.tasks) ||
          !Array.isArray(summary.questions)
        )
          throw new Error('Invalid summary')
        aggregate.value = summary
        responses.value = result.data
        responseTotal.value = result.total
        responsePage.value = index
        mode.value = 'results'
      },
    )
  }
  async function exportCsv() {
    if (!original.value || isPublic.value) return
    await read(
      async (selected, signal) => {
        if (selected.kind !== 'member') throw new Error('Unavailable')
        return api.csv(selected.revision.versionId, selected.revision.id, original.value!.id, {
          signal,
          silent: true,
        })
      },
      (result) => {
        if (!result.contentType.toLowerCase().startsWith('text/csv'))
          throw new Error('Invalid export')
        void download(result)
      },
    )
  }
  async function loadScripts(index = 0) {
    return read(
      (selected, signal) => {
        if (selected.kind !== 'member') throw new Error('Unavailable')
        return demoScriptApi.query(selected.revision.versionId, selected.revision.id, index, {
          signal,
          silent: true,
        })
      },
      (result) => {
        pager(result, index)
        scripts.value = result.data
        scriptTotal.value = result.total
        scriptPage.value = index
      },
    )
  }
  async function copyScript(id: string) {
    if (!editable.value || locked.value) return
    await read(
      (selected, signal) => {
        if (selected.kind !== 'member') throw new Error('Unavailable')
        return demoScriptApi.get(selected.revision.versionId, selected.revision.id, id, {
          signal,
          silent: true,
        })
      },
      (result) => {
        const selected = authorized.value
        if (
          selected?.kind !== 'member' ||
          result.revisionId !== selected.revision.id ||
          result.versionId !== selected.revision.versionId ||
          result.projectId !== selected.project.id ||
          result.steps.length > 12 ||
          form.tasks.length >= 12 ||
          form.tasks.reduce((sum, task) => sum + task.steps.length, result.steps.length) > 48 ||
          result.steps.some((step) => !pageIds.value.has(step.pageId))
        ) {
          error.value = t('proto.studyCopyLimit')
          return
        }
        form.tasks.push(taskFromScript(result))
        notice.value = t('proto.studyCopiedTask')
      },
    )
  }
  const checkCredential = () => {
    if (!isPublic.value && credential !== token.get()) revoke()
  }
  window.addEventListener('storage', checkCredential)
  window.addEventListener('focus', checkCredential)
  watch(
    () => {
      const value = authorized.value
      return JSON.stringify(
        value?.kind === 'member'
          ? [
              value.kind,
              value.actorId,
              value.project.id,
              value.revision.versionId,
              value.revision.id,
              projectAllows(value.project, 'edit') && permissions.can(p.version.save),
            ]
          : value
            ? [
                value.kind,
                value.share.token,
                value.share.revisionId,
                value.share.accessKey,
                value.share.reviewEnabled,
                value.share.reviewUnverifiedAllowed,
                identity.value?.session?.guestId,
                identity.value?.session?.verificationLevel,
                identity.value?.csrfToken,
              ]
            : null,
      )
    },
    () => {
      clear()
      credential = token.get()
      if (scope.value && !authorized.value) revoke()
      else void load(0)
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    window.removeEventListener('storage', checkCredential)
    window.removeEventListener('focus', checkCredential)
    clear()
  })
  return {
    authorized,
    isPublic,
    canEdit,
    editable,
    identified,
    answerable,
    denied,
    pages,
    pageIds,
    form,
    answers,
    original,
    own,
    rows,
    scripts,
    aggregate,
    responses,
    pageIndex,
    total,
    responsePage,
    responseTotal,
    scriptPage,
    scriptTotal,
    mode,
    loading,
    busy,
    unknown,
    conflict,
    invalid,
    error,
    notice,
    locked,
    dirty,
    load,
    open,
    create,
    save,
    action,
    participate,
    retry,
    results,
    exportCsv,
    loadScripts,
    copyScript,
  }
}
