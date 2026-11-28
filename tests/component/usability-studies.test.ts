import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import { useUsabilityStudies } from '@/modules/protohub-manager-ui/hooks/useUsabilityStudies'
import { usabilityStudyApi as api } from '@/modules/protohub-manager-ui/api/usability-study'
import type { ReviewContext } from '@/modules/protohub-manager-ui/types'
import type { StudyScope } from '@/modules/protohub-manager-ui/types/usability-study'
import {
  blankStudy,
  copyStudy,
  taskFromScript,
  validStudy,
  validStudyAnswers,
  normalizeStudyAnswerValues,
} from '@/modules/protohub-manager-ui/utils/usability-study'
import UsabilityStudyEditor from '@/modules/protohub-manager-ui/components/UsabilityStudyEditor.vue'
import UsabilityStudyParticipation from '@/modules/protohub-manager-ui/components/UsabilityStudyParticipation.vue'
import { ApiError } from '@/shared/api/errors'
import { permissionKey } from '@/shared/auth/provider'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import { hookHarness } from '../fixtures/hook-harness'
import {
  studyScope,
  study,
  ownStudyResponse,
  submittedStudyWireResponse,
} from '../fixtures/usability-study'
const credential = vi.hoisted(() => ({ value: 'one' }))
vi.mock('@/shared/auth/token', () => ({ token: { get: () => credential.value } }))
vi.mock('@/modules/protohub-manager-ui/api/usability-study', () => ({
  usabilityStudyApi: {
    query: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    action: vi.fn(),
    publicQuery: vi.fn(),
    context: vi.fn(),
    participate: vi.fn(),
    responses: vi.fn(),
    summary: vi.fn(),
    csv: vi.fn(),
  },
}))
const wrappers: VueWrapper[] = []
const publicStudy = () => ({
  ...copyStudy(study),
  id: study.id,
  state: 'open' as const,
  contentVersion: 1,
})
const visitorScope = (): StudyScope => ({
  kind: 'public',
  context: structuredClone(studyScope.context),
  share: {
    token: 'share',
    revisionId: 'r1',
    accessKey: 'grant',
    revisionMode: 'latest',
    projectName: 'P',
    versionName: 'V1',
    passwordRequired: false,
    reviewEnabled: true,
    reviewUnverifiedAllowed: true,
  },
})
const identity = (): ReviewContext => ({
  revisionId: 'r1',
  enabled: true,
  csrfToken: 'csrf',
  mailAvailable: false,
  allowUnverified: true,
  session: {
    guestId: 'g1',
    verificationLevel: 'unverified',
    displayName: 'Name',
    maskedEmail: null,
    company: null,
    expiresAt: Date.now() + 100000,
  },
})
async function setup(value: StudyScope = studyScope, visitor?: ReviewContext) {
  const current = ref<StudyScope | undefined>(structuredClone(value)),
    review = ref(visitor),
    edit = ref(true)
  let state!: ReturnType<typeof useUsabilityStudies>
  wrappers.push(
    mount(
      hookHarness(() => {
        state = useUsabilityStudies(current, review)
      }),
      {
        global: {
          provide: {
            [permissionKey]: { can: (p: string) => (p.endsWith(':save') ? edit.value : true) },
          },
        },
      },
    ),
  )
  await flushPromises()
  return { state, current, review, edit }
}
beforeEach(() => {
  vi.resetAllMocks()
  credential.value = 'one'
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  i18n.global.mergeLocaleMessage('en', { proto: protoLocales.en })
  vi.mocked(api.query).mockResolvedValue({ data: [], total: 0, pageIndex: 0, pageSize: 20 })
  vi.mocked(api.publicQuery).mockResolvedValue({ data: [], total: 0, pageIndex: 0, pageSize: 20 })
  vi.mocked(api.get).mockResolvedValue(structuredClone(study))
  vi.mocked(api.context).mockResolvedValue({
    study: publicStudy(),
    participation: structuredClone(ownStudyResponse),
  })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})
it('validates real-page tasks, stable identifiers, bounded questions and explicit complete self-reports', () => {
  const value = copyStudy(study),
    pages = new Set(['home'])
  expect(validStudy(value, pages, true)).toBe(true)
  expect(validStudy(blankStudy(), pages)).toBe(false)
  value.tasks[0].steps[0].pageId = 'folder'
  expect(validStudy(value, pages)).toBe(false)
  value.tasks[0].steps[0].pageId = 'home'
  value.questions[0].options[1].id = 'yes'
  expect(validStudy(value, pages)).toBe(false)
  expect(validStudyAnswers({ taskAnswers: [], answers: [], feedback: '' }, study, false)).toBe(true)
  expect(validStudyAnswers({ taskAnswers: [], answers: [], feedback: '' }, study, true)).toBe(false)
  expect(
    validStudyAnswers(
      {
        taskAnswers: [{ taskId: 'task1', outcome: 'skipped', feedback: '' }],
        answers: [
          { questionId: 'choice', optionId: 'yes' },
          { questionId: 'rate', rating: 6 },
        ],
        feedback: '',
      },
      study,
      true,
    ),
  ).toBe(false)
})
it('copies ordinary script content into independent task and page ids without a source reference', () => {
  const script = {
    id: 'script',
    projectId: 'p1',
    revisionId: 'r1',
    versionId: 'v1',
    title: 'Script',
    objective: 'Goal',
    prerequisites: '',
    resetNote: '',
    shareEnabled: false,
    steps: [{ id: 'step1', pageId: 'home', narration: 'Read' }],
    configVersion: 0,
    createdAt: 1,
    updatedAt: 1,
  }
  const task = taskFromScript(script)
  expect(task.id).not.toBe(script.id)
  expect(task.steps[0].id).not.toBe('step1')
  task.steps[0].narration = 'Edit'
  expect(script.steps[0].narration).toBe('Read')
  expect(Object.keys(task)).toEqual([
    'id',
    'title',
    'objective',
    'prerequisites',
    'resetNote',
    'steps',
  ])
})
it('retains the exact unknown member payload, preserves draft on known conflict, and clears on actor change', async () => {
  const { state, current } = await setup()
  await state.open(study.id)
  state.form.title = 'Changed'
  vi.mocked(api.update).mockRejectedValueOnce(new ApiError('network'))
  await state.save()
  expect(state.unknown.value).toBe(true)
  const input = vi.mocked(api.update).mock.calls[0][3]
  vi.mocked(api.update).mockResolvedValue({ ...study, title: 'Changed', configVersion: 1 })
  await state.retry()
  expect(vi.mocked(api.update).mock.calls[1][3]).toBe(input)
  expect(state.dirty.value).toBe(false)
  state.form.title = 'Keep me'
  vi.mocked(api.update).mockRejectedValueOnce(new ApiError('conflict', 409))
  await state.save()
  expect(state.conflict.value).toBe(true)
  expect(state.form.title).toBe('Keep me')
  await state.open(study.id, true)
  expect(state.form.title).toBe('Keep me')
  expect(state.conflict.value).toBe(false)
  current.value = { ...studyScope, kind: 'member', actorId: 'other' } as StudyScope
  await flushPromises()
  expect(state.form.title).toBe('')
  expect(state.original.value).toBeUndefined()
})
it('requires separate consent, keeps unknown participation request stable, and clears withdrawn content', async () => {
  const review = identity()
  vi.mocked(api.context).mockResolvedValueOnce({ study: publicStudy(), participation: null })
  const { state } = await setup(visitorScope(), review)
  await state.open(study.id)
  expect(api.participate).not.toHaveBeenCalled()
  vi.mocked(api.participate).mockRejectedValueOnce(new ApiError('network'))
  await state.participate('consent')
  expect(state.unknown.value).toBe(true)
  const input = vi.mocked(api.participate).mock.calls[0][3]
  expect(input).toMatchObject({ agreed: true, contentVersion: 1 })
  vi.mocked(api.participate).mockResolvedValueOnce({
    status: 'current',
    participation: structuredClone(ownStudyResponse),
  })
  await state.retry()
  expect(vi.mocked(api.participate).mock.calls[1][3]).toBe(input)
  state.answers.feedback = 'private text'
  vi.mocked(api.participate).mockResolvedValueOnce({
    status: 'current',
    participation: { ...ownStudyResponse, status: 'withdrawn', configVersion: 1 },
  })
  await state.participate('withdraw')
  expect(state.answers.feedback).toBe('')
  expect(state.own.value?.status).toBe('withdrawn')
})
it('keeps answers through runtime frame replacement but clears them and rejects a late result on identity rotation', async () => {
  const { state, current, review } = await setup(visitorScope(), identity())
  await state.open(study.id)
  state.answers.feedback = 'private'
  current.value = {
    ...current.value!,
    context: { ...studyScope.context, runtimeBaseUrl: '/api/prototype-hub/runtime/new' },
  }
  await flushPromises()
  expect(state.answers.feedback).toBe('private')
  let complete!: (value: { status: 'current'; participation: typeof ownStudyResponse }) => void
  vi.mocked(api.participate).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  const pending = state.participate('progress')
  review.value = {
    ...identity(),
    csrfToken: 'rotated',
    session: { ...identity().session!, guestId: 'g2' },
  }
  await flushPromises()
  complete({ status: 'current', participation: { ...ownStudyResponse, feedback: 'late private' } })
  await pending
  expect(state.answers.feedback).toBe('')
  expect(state.own.value).toBeNull()
  expect(state.original.value).toBeUndefined()
})
it('never interprets opening a prototype page as task completion, and shows a separately checked consent action', async () => {
  const answers = { taskAnswers: [], answers: [], feedback: '' }
  const wrapper = mount(UsabilityStudyParticipation, {
    props: {
      study: publicStudy(),
      answers,
      own: null,
      identified: true,
      locked: false,
      context: studyScope.context,
    },
    global: { plugins: [i18n] },
  })
  wrappers.push(wrapper)
  const consent = wrapper
    .findAll('button')
    .find((button) => button.text().includes(protoLocales.zh.studyConsentAction))!
  expect(consent.attributes('disabled')).toBeDefined()
  await wrapper.get('input[type=checkbox]').setValue(true)
  await consent.trigger('click')
  expect(wrapper.emitted('action')?.[0]).toEqual(['consent'])
  expect(answers.taskAnswers).toHaveLength(0)
  await wrapper.setProps({ own: structuredClone(ownStudyResponse) })
  await flushPromises()
  const openPage = wrapper
    .findAll('button')
    .find((button) => button.text().includes(protoLocales.zh.studyOpenPage))!
  await openPage.trigger('click')
  expect(answers.taskAnswers).toHaveLength(0)
  expect(wrapper.find('iframe').exists()).toBe(true)
})

it('keeps participant draft answers when refreshing a known conflict and treats deleted receipts as missing', async () => {
  const { state } = await setup(visitorScope(), identity())
  await state.open(study.id)
  state.answers.feedback = 'Keep my draft'
  vi.mocked(api.participate).mockRejectedValueOnce(new ApiError('conflict', 409))
  await state.participate('progress')
  expect(state.conflict.value).toBe(true)
  vi.mocked(api.context).mockResolvedValueOnce({
    study: publicStudy(),
    participation: { ...ownStudyResponse, configVersion: 4, feedback: 'Other saved content' },
  })
  await state.open(study.id, true)
  expect(state.answers.feedback).toBe('Keep my draft')
  expect(state.own.value?.configVersion).toBe(4)
  vi.mocked(api.participate).mockResolvedValueOnce({ status: 'missing', participation: null })
  await state.participate('progress')
  expect(state.mode.value).toBe('list')
  expect(state.original.value).toBeUndefined()
  expect(state.answers.feedback).toBe('')
  expect(state.notice.value).toBe(protoLocales.zh.studyRemoved)
})
it('supports explicit task authoring and script selection with real keyboard buttons', async () => {
  const form = reactive(copyStudy(study))
  const wrapper = mount(UsabilityStudyEditor, {
    props: {
      form,
      section: 'tasks',
      pages: [{ pageId: 'home', name: 'Home', path: 'index.html' }],
      disabled: false,
      scripts: [],
      scriptTotal: 0,
      scriptPage: 0,
      loading: false,
    },
    global: { plugins: [i18n] },
  })
  wrappers.push(wrapper)
  const copy = wrapper
    .findAll('button')
    .find((button) => button.text() === protoLocales.zh.studyCopyScript)!
  await copy.trigger('click')
  expect(wrapper.emitted('scripts')?.[0]).toEqual([0])
  await wrapper.get('[data-study-add-task]').trigger('click')
  expect(form.tasks).toHaveLength(2)
  expect(wrapper.findAll('select').some((select) => select.element.value === 'home')).toBe(true)
  expect(wrapper.find('input[required]').exists()).toBe(true)
})

it('resolves an ambiguous full-questionnaire submit to submitted with the exact original request', async () => {
  const { state } = await setup(visitorScope(), identity())
  await state.open(study.id)
  state.answers.taskAnswers = structuredClone(submittedStudyWireResponse.taskAnswers)
  state.answers.answers = normalizeStudyAnswerValues(submittedStudyWireResponse.answers)
  vi.mocked(api.participate).mockRejectedValueOnce(new ApiError('network'))
  await state.participate('submit')
  expect(state.unknown.value).toBe(true)
  const original = vi.mocked(api.participate).mock.calls[0][3]
  vi.mocked(api.participate).mockResolvedValueOnce({
    status: 'current',
    participation: {
      ...submittedStudyWireResponse,
      answers: normalizeStudyAnswerValues(submittedStudyWireResponse.answers),
    },
  })
  await state.retry()
  expect(vi.mocked(api.participate).mock.calls[1][3]).toBe(original)
  expect(state.unknown.value).toBe(false)
  expect(state.own.value?.status).toBe('submitted')
  expect(state.answerable.value).toBe(false)
})
it('counts only permitted payload fields when validating response metadata', () => {
  const definition = Object.assign(copyStudy(study), { extraMetadata: 'x'.repeat(131072) })
  expect(validStudy(definition, new Set(['home']), true)).toBe(true)
  const answers = Object.assign(
    {
      taskAnswers: submittedStudyWireResponse.taskAnswers,
      answers: normalizeStudyAnswerValues(submittedStudyWireResponse.answers),
      feedback: '',
    },
    { extraMetadata: 'x'.repeat(65536) },
  )
  expect(validStudyAnswers(answers, study, true)).toBe(true)
  answers.feedback = 'x'.repeat(2001)
  expect(validStudyAnswers(answers, study, true)).toBe(false)
})
