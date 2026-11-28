<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Button as AButton } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { WorkspaceContext } from '../types'
import type {
  StudyDefinition,
  StudyAnswers,
  OwnStudyResponse,
  StudyTaskAnswer,
  StudyQuestion,
} from '../types/usability-study'
import DemoScriptPlayer from './DemoScriptPlayer.vue'
import UsabilityResponseContent from './UsabilityResponseContent.vue'
const props = defineProps<{
  study: StudyDefinition & { state?: string }
  answers: StudyAnswers
  own?: OwnStudyResponse | null
  identified: boolean
  locked: boolean
  context: WorkspaceContext
  preview?: boolean
  invalid?: boolean
}>()
const emit = defineEmits<{
  action: [kind: 'consent' | 'progress' | 'submit' | 'withdraw']
  authenticate: []
}>()
const { t } = useI18n()
const answers = computed(() => props.answers),
  root = ref<HTMLElement>(),
  heading = ref<HTMLElement>()
const phase = ref<'intro' | 'tasks' | 'questions' | 'review'>('intro'),
  agreed = ref(false),
  taskIndex = ref(0),
  stepId = ref(''),
  openedPage = ref('')
const task = computed(() => props.study.tasks[taskIndex.value])
const answerable = computed(
  () => props.preview || (props.own?.status === 'draft' && props.study.state === 'open'),
)
const taskAnswer = computed(() =>
  props.answers.taskAnswers.find((answer) => answer.taskId === task.value?.id),
)
const step = computed(
  () => task.value?.steps.find((item) => item.id === stepId.value) || task.value?.steps[0],
)
watch(
  () => task.value?.id,
  () => {
    stepId.value = task.value?.steps[0]?.id || ''
    openedPage.value = ''
  },
  { immediate: true },
)
watch(
  () => props.own?.status,
  (status, previous) => {
    if (status === 'draft' && !previous) phase.value = 'tasks'
    if (status === 'submitted' || status === 'withdrawn') phase.value = 'review'
  },
  { immediate: true },
)
async function focusHeading() {
  await nextTick()
  heading.value?.focus()
}
function go(value: typeof phase.value) {
  phase.value = value
  openedPage.value = ''
  void focusHeading()
}
function taskMove(offset: number) {
  if (taskIndex.value + offset < 0) return
  if (taskIndex.value + offset >= props.study.tasks.length) {
    go('questions')
    return
  }
  taskIndex.value += offset
  openedPage.value = ''
  void focusHeading()
}
function outcome(value: string) {
  if (!task.value || props.locked || !answerable.value || props.preview) return
  const index = answers.value.taskAnswers.findIndex((answer) => answer.taskId === task.value.id)
  if (!value) {
    if (index >= 0) answers.value.taskAnswers.splice(index, 1)
    return
  }
  const answer: StudyTaskAnswer = {
    taskId: task.value.id,
    outcome: value as StudyTaskAnswer['outcome'],
    feedback: taskAnswer.value?.feedback || '',
  }
  if (index < 0) answers.value.taskAnswers.push(answer)
  else answers.value.taskAnswers[index] = answer
}
function questionValue(question: StudyQuestion): string {
  const answer = answers.value.answers.find((item) => item.questionId === question.id)
  return question.type === 'text'
    ? answer?.text || ''
    : question.type === 'rating'
      ? String(answer?.rating || '')
      : answer?.optionId || ''
}
function setQuestion(question: StudyQuestion, value: string) {
  if (props.locked || !answerable.value || props.preview) return
  const index = answers.value.answers.findIndex((answer) => answer.questionId === question.id)
  if (!value) {
    if (index >= 0) answers.value.answers.splice(index, 1)
    return
  }
  const answer = {
    questionId: question.id,
    ...(question.type === 'text'
      ? { text: value }
      : question.type === 'rating'
        ? { rating: Number(value) }
        : { optionId: value }),
  }
  if (index < 0) answers.value.answers.push(answer)
  else answers.value.answers[index] = answer
}
function feedback(value: string) {
  if (taskAnswer.value && !props.locked && answerable.value && !props.preview)
    taskAnswer.value.feedback = value
}
async function focusInvalid() {
  const index = props.study.tasks.findIndex(
    (task) => !answers.value.taskAnswers.some((answer) => answer.taskId === task.id),
  )
  if (index >= 0) {
    taskIndex.value = index
    phase.value = 'tasks'
    await nextTick()
    root.value?.querySelector<HTMLElement>('#study-outcome')?.focus()
    return
  }
  const question = props.study.questions.find(
    (question) =>
      question.required &&
      !answers.value.answers.some(
        (answer) =>
          answer.questionId === question.id && (question.type !== 'text' || answer.text?.trim()),
      ),
  )
  if (question) {
    phase.value = 'questions'
    await nextTick()
    root.value?.querySelector<HTMLElement>(`[id="study-answer-${question.id}"]`)?.focus()
  }
}
defineExpose({ focusHeading, focusInvalid })
</script>
<template>
  <div ref="root" class="study-participation">
    <template v-if="own?.status === 'withdrawn'"
      ><h2 ref="heading" tabindex="-1">{{ t('proto.studyWithdrawn') }}</h2></template
    >
    <template v-else-if="phase === 'intro'">
      <h2 ref="heading" tabindex="-1">{{ study.title }}</h2>
      <p v-if="study.introduction" class="study-text study-introduction">
        {{ study.introduction }}
      </p>
      <h3>{{ t('proto.studyReadConsent') }}</h3>
      <p class="study-text">{{ study.consentText }}</p>
      <template v-if="preview"
        ><label class="study-check study-consent-check"
          ><input type="checkbox" disabled />{{ t('proto.studyConsentCheck') }}</label
        ><a-button type="primary" :disabled="!study.tasks.length" @click="go('tasks')">{{
          t('proto.studyPreviewTask')
        }}</a-button></template
      >
      <template v-else-if="!own">
        <p v-if="study.state === 'closed'" role="status">{{ t('proto.studyClosed') }}</p>
        <template v-else-if="!identified"
          ><p>{{ t('proto.studyIdentityNeeded') }}</p>
          <a-button type="primary" @click="emit('authenticate')">{{
            t('proto.studyAuthenticate')
          }}</a-button></template
        >
        <template v-else
          ><label class="study-check study-consent-check"
            ><input v-model="agreed" autocomplete="off" type="checkbox" :disabled="locked" />{{
              t('proto.studyConsentCheck')
            }}</label
          ><a-button
            type="primary"
            :disabled="!agreed || locked"
            @click="emit('action', 'consent')"
            >{{ t('proto.studyConsentAction') }}</a-button
          ></template
        >
      </template>
      <a-button
        v-else
        type="primary"
        @click="go(own.status === 'submitted' || study.state === 'closed' ? 'review' : 'tasks')"
        >{{ t(own.status === 'submitted' ? 'proto.studySubmitted' : 'proto.studyDraft') }}</a-button
      >
    </template>
    <template v-else-if="phase === 'tasks' && task">
      <div class="study-task-layout">
        <section class="study-task-instructions">
          <p class="muted study-position">
            {{ t('proto.studyTaskPosition', { index: taskIndex + 1, count: study.tasks.length }) }}
          </p>
          <h2 ref="heading" tabindex="-1">{{ task.title }}</h2>
          <p v-if="task.objective" class="study-text">{{ task.objective }}</p>
          <details v-if="task.prerequisites || task.resetNote">
            <summary>{{ t('proto.studyPrerequisites') }}</summary>
            <p v-if="task.prerequisites" class="study-text">{{ task.prerequisites }}</p>
            <h3 v-if="task.resetNote">{{ t('proto.studyReset') }}</h3>
            <p v-if="task.resetNote" class="study-text">{{ task.resetNote }}</p>
          </details>
          <label for="study-active-page">{{ t('proto.studySteps') }}</label
          ><select
            id="study-active-page"
            v-model="stepId"
            autocomplete="off"
            name="study-active-page"
            :disabled="locked"
            @change="openedPage = ''"
          >
            <option v-for="(item, index) in task.steps" :key="item.id" :value="item.id">
              {{ t('proto.studyStepItem', { index: index + 1 }) }}
            </option>
          </select>
          <p v-if="step?.narration" class="study-text">{{ step.narration }}</p>
          <a-button :disabled="!step || locked" @click="openedPage = step!.pageId">{{
            t('proto.studyOpenPage')
          }}</a-button>
          <div>
            <label for="study-outcome">{{ t('proto.studySelfReport') }}</label
            ><select
              id="study-outcome"
              autocomplete="off"
              name="study-outcome"
              :value="taskAnswer?.outcome || ''"
              :aria-invalid="(invalid && !taskAnswer) || undefined"
              :disabled="preview || locked || !answerable"
              @change="outcome(($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t('proto.studyNotAnswered') }}</option>
              <option
                v-for="value in ['completed', 'not_completed', 'skipped']"
                :key="value"
                :value="value"
              >
                {{ t(`proto.studyOutcome_${value}`) }}
              </option>
            </select>
            <p v-if="invalid && !taskAnswer" class="study-field-error">
              {{ t('proto.studyFieldRequired') }}
            </p>
            <label for="study-task-feedback">{{ t('proto.studyTaskFeedback') }}</label
            ><textarea
              id="study-task-feedback"
              autocomplete="off"
              name="study-task-feedback"
              :value="taskAnswer?.feedback || ''"
              :disabled="preview || locked || !answerable || !taskAnswer"
              maxlength="2000"
              rows="3"
              @input="feedback(($event.target as HTMLTextAreaElement).value)"
            />
          </div>
        </section>
        <demo-script-player v-if="openedPage" :context="context" :page-id="openedPage" />
      </div>
      <div class="study-flow-actions">
        <a-button :disabled="locked" @click="taskIndex ? taskMove(-1) : go('intro')">{{
          t('proto.studyPrevious')
        }}</a-button
        ><a-button
          v-if="!preview && answerable"
          :disabled="locked"
          @click="emit('action', 'progress')"
          >{{ t('proto.studySaveProgress') }}</a-button
        ><a-button type="primary" :disabled="locked" @click="taskMove(1)">{{
          t('proto.studyNext')
        }}</a-button>
      </div>
    </template>
    <template v-else-if="phase === 'questions'">
      <h2 ref="heading" tabindex="-1">{{ t('proto.studyQuestions') }}</h2>
      <p v-if="!study.questions.length">{{ t('proto.studyNoQuestions') }}</p>
      <section v-for="question in study.questions" :key="question.id" class="study-question-field">
        <label :for="`study-answer-${question.id}`"
          >{{ question.prompt }}
          <span v-if="question.required" class="study-required">{{
            t('proto.studyRequiredMark')
          }}</span></label
        >
        <ul v-if="preview && question.type === 'singleChoice'" class="study-preview-options">
          <li v-for="option in question.options" :key="option.id">{{ option.label }}</li>
        </ul>
        <p v-else-if="preview && question.type === 'rating'">
          {{ [1, 2, 3, 4, 5].map((value) => t('proto.studyRatingValue', { value })).join(' · ') }}
        </p>
        <textarea
          v-else-if="question.type === 'text'"
          :id="`study-answer-${question.id}`"
          autocomplete="off"
          :name="`study-answer-${question.id}`"
          :value="questionValue(question)"
          :required="question.required"
          :aria-invalid="
            (invalid && question.required && !questionValue(question).trim()) || undefined
          "
          :disabled="locked || !answerable || preview"
          rows="4"
          maxlength="2000"
          @input="setQuestion(question, ($event.target as HTMLTextAreaElement).value)"
        />
        <select
          v-else
          :id="`study-answer-${question.id}`"
          autocomplete="off"
          :name="`study-answer-${question.id}`"
          :value="questionValue(question)"
          :required="question.required"
          :aria-invalid="
            (invalid && question.required && !questionValue(question).trim()) || undefined
          "
          :disabled="locked || !answerable || preview"
          @change="setQuestion(question, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ t('proto.studyNotAnswered') }}</option>
          <template v-if="question.type === 'singleChoice'"
            ><option v-for="option in question.options" :key="option.id" :value="option.id">
              {{ option.label }}
            </option></template
          ><template v-else
            ><option v-for="value in 5" :key="value" :value="String(value)">
              {{ t('proto.studyRatingValue', { value }) }}
            </option></template
          >
        </select>
        <p
          v-if="invalid && question.required && !questionValue(question).trim()"
          class="study-field-error"
        >
          {{ t('proto.studyFieldRequired') }}
        </p>
      </section>
      <template v-if="!preview"
        ><label for="study-general-feedback">{{ t('proto.studyGeneralFeedback') }}</label
        ><textarea
          id="study-general-feedback"
          v-model="answers.feedback"
          autocomplete="off"
          name="study-general-feedback"
          :disabled="locked || !answerable"
          maxlength="2000"
          rows="4"
        />
      </template>
      <div class="study-flow-actions">
        <a-button :disabled="locked" @click="go('tasks')">{{ t('proto.studyPrevious') }}</a-button
        ><a-button
          v-if="!preview && answerable"
          :disabled="locked"
          @click="emit('action', 'progress')"
          >{{ t('proto.studySaveProgress') }}</a-button
        ><a-button type="primary" :disabled="locked" @click="go('review')">{{
          t('proto.studyReview')
        }}</a-button>
      </div>
    </template>
    <template v-else>
      <h2 ref="heading" tabindex="-1">
        {{ t(own?.status === 'submitted' ? 'proto.studySubmitted' : 'proto.studyReview') }}
      </h2>
      <p v-if="study.state === 'closed'">{{ t('proto.studyClosed') }}</p>
      <usability-response-content :definition="study" :answers="answers" />
      <p v-if="answerable && !preview">{{ t('proto.studySubmitHint') }}</p>
      <div class="study-flow-actions">
        <a-button :disabled="locked" @click="go('questions')">{{
          t('proto.studyPrevious')
        }}</a-button
        ><a-button
          v-if="own && !preview"
          danger
          :disabled="locked || !identified"
          @click="emit('action', 'withdraw')"
          >{{ t('proto.studyWithdraw') }}</a-button
        ><a-button
          v-if="answerable && !preview"
          type="primary"
          :disabled="locked"
          @click="emit('action', 'submit')"
          >{{ t('proto.studySubmit') }}</a-button
        >
      </div>
    </template>
  </div>
</template>
