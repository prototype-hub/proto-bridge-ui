<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Button as AButton, Pagination as APagination } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { secureId } from '@/shared/utils/secure-id'
import { moveStudyItem } from '../utils/usability-study'
import type { StudyDefinition, StudyQuestion } from '../types/usability-study'
import type { DemoScriptSummary } from '../types/demo-script'
const props = defineProps<{
  form: StudyDefinition
  section: 'basics' | 'tasks' | 'questions'
  pages: { pageId: string; name: string; path: string }[]
  disabled: boolean
  invalid?: boolean
  scripts: DemoScriptSummary[]
  scriptTotal: number
  scriptPage: number
  loading: boolean
}>()
const emit = defineEmits<{ scripts: [page: number]; copy: [id: string] }>()
const { t } = useI18n()
const form = computed(() => props.form)
const root = ref<HTMLElement>(),
  selectedTask = ref(''),
  selectedQuestion = ref(''),
  copying = ref(false)
const stepCount = computed(() => form.value.tasks.reduce((sum, task) => sum + task.steps.length, 0))
async function focus(id: string) {
  await nextTick()
  root.value?.querySelector<HTMLElement>(`[id="${id}"]`)?.focus()
}
async function focusInvalid() {
  if (props.section === 'tasks')
    selectedTask.value =
      form.value.tasks.find((task) => !task.title.trim() || !task.steps.length)?.id ||
      form.value.tasks[0]?.id ||
      ''
  if (props.section === 'questions')
    selectedQuestion.value =
      form.value.questions.find(
        (question) =>
          !question.prompt.trim() || question.options.some((option) => !option.label.trim()),
      )?.id ||
      form.value.questions[0]?.id ||
      ''
  await nextTick()
  root.value?.querySelector<HTMLElement>(':invalid')?.focus()
}
defineExpose({ focusInvalid })
function addTask() {
  if (
    props.disabled ||
    form.value.tasks.length >= 12 ||
    !props.pages.length ||
    stepCount.value >= 48
  )
    return
  const id = secureId()
  form.value.tasks.push({
    id,
    title: '',
    objective: '',
    prerequisites: '',
    resetNote: '',
    steps: [{ id: secureId(), pageId: props.pages[0].pageId, narration: '' }],
  })
  selectedTask.value = id
  void focus(`study-task-${id}`)
}
function addStep(index: number) {
  const task = form.value.tasks[index]
  if (props.disabled || task.steps.length >= 12 || stepCount.value >= 48 || !props.pages.length)
    return
  const id = secureId()
  task.steps.push({ id, pageId: props.pages[0].pageId, narration: '' })
  void focus(`study-page-${id}`)
}
function addQuestion() {
  if (props.disabled || form.value.questions.length >= 8) return
  const id = secureId()
  form.value.questions.push({
    id,
    prompt: '',
    type: 'singleChoice',
    required: false,
    options: [
      { id: secureId(), label: '' },
      { id: secureId(), label: '' },
    ],
  })
  selectedQuestion.value = id
  void focus(`study-question-${id}`)
}
function changeType(question: StudyQuestion) {
  question.options =
    question.type === 'singleChoice'
      ? [
          { id: secureId(), label: '' },
          { id: secureId(), label: '' },
        ]
      : []
}
function toggleScripts() {
  copying.value = !copying.value
  if (copying.value) emit('scripts', 0)
}
function copy(id: string) {
  emit('copy', id)
  copying.value = false
  selectedTask.value = ''
}
function removeTask(index: number) {
  form.value.tasks.splice(index, 1)
  selectedTask.value = form.value.tasks[Math.min(index, form.value.tasks.length - 1)]?.id || ''
  void nextTick(() => root.value?.querySelector<HTMLElement>('[data-study-add-task]')?.focus())
}
</script>
<template>
  <div ref="root" class="study-editor">
    <section v-if="section === 'basics'" class="study-fields">
      <label for="study-title">{{ t('proto.studyTitle') }}</label>
      <input
        id="study-title"
        v-model="form.title"
        name="study-title"
        :aria-invalid="(invalid && !form.title.trim()) || undefined"
        maxlength="120"
        :disabled="disabled"
        autocomplete="off"
        required
      />
      <p v-if="invalid && !form.title.trim()" class="study-field-error">
        {{ t('proto.studyFieldRequired') }}
      </p>
      <label for="study-introduction">{{ t('proto.studyIntroduction') }}</label>
      <textarea
        id="study-introduction"
        v-model="form.introduction"
        autocomplete="off"
        name="study-introduction"
        rows="5"
        maxlength="4000"
        :disabled="disabled"
      />
      <label for="study-consent">{{ t('proto.studyConsent') }}</label>
      <textarea
        id="study-consent"
        v-model="form.consentText"
        autocomplete="off"
        name="study-consent"
        :aria-invalid="(invalid && !form.consentText.trim()) || undefined"
        rows="7"
        maxlength="4000"
        :disabled="disabled"
        required
      />
      <p v-if="invalid && !form.consentText.trim()" class="study-field-error">
        {{ t('proto.studyFieldRequired') }}
      </p>
    </section>
    <section v-else-if="section === 'tasks'">
      <div class="study-toolbar">
        <h2>
          {{ t('proto.studyTasks') }} <span>{{ form.tasks.length }}/12</span>
        </h2>
        <div class="study-actions">
          <a-button :disabled="disabled || form.tasks.length >= 12" @click="toggleScripts">{{
            t('proto.studyCopyScript')
          }}</a-button>
          <a-button
            data-study-add-task
            :disabled="disabled || form.tasks.length >= 12 || stepCount >= 48 || !pages.length"
            @click="addTask"
            >{{ t('proto.studyAddTask') }}</a-button
          >
        </div>
      </div>
      <div v-if="copying" class="study-source">
        <h3>{{ t('proto.studyCopyScript') }}</h3>
        <p v-if="!scripts.length && !loading" class="muted">{{ t('proto.studyNoScripts') }}</p>
        <ul class="study-records">
          <li v-for="script in scripts" :key="script.id" class="study-source-row">
            <strong>{{ script.title }}</strong
            ><a-button :disabled="disabled || loading" @click="copy(script.id)">{{
              t('proto.studyCopyTask')
            }}</a-button>
          </li>
        </ul>
        <a-pagination
          v-if="scriptTotal > 20"
          :current="scriptPage + 1"
          :page-size="20"
          :total="scriptTotal"
          :show-size-changer="false"
          :disabled="loading"
          @change="emit('scripts', $event - 1)"
        />
      </div>
      <p v-if="!form.tasks.length" class="study-empty">{{ t('proto.studyNoTasks') }}</p>
      <div v-for="(task, index) in form.tasks" :key="task.id" class="study-edit-item">
        <div class="study-item-heading">
          <button
            class="study-disclosure"
            :aria-expanded="selectedTask === task.id"
            @click="selectedTask = selectedTask === task.id ? '' : task.id"
          >
            {{ task.title || t('proto.studyTaskItem', { index: index + 1 }) }}
          </button>
          <div class="study-actions">
            <a-button
              :disabled="disabled || !index"
              :aria-label="`${t('proto.studyUp')}: ${task.title || index + 1}`"
              @click="moveStudyItem(form.tasks, index, -1)"
              >{{ t('proto.studyUp') }}</a-button
            ><a-button
              :disabled="disabled || index === form.tasks.length - 1"
              :aria-label="`${t('proto.studyDown')}: ${task.title || index + 1}`"
              @click="moveStudyItem(form.tasks, index, 1)"
              >{{ t('proto.studyDown') }}</a-button
            ><a-button
              danger
              :disabled="disabled"
              :aria-label="`${t('proto.studyRemove')}: ${task.title || index + 1}`"
              @click="removeTask(index)"
              >{{ t('proto.studyRemove') }}</a-button
            >
          </div>
        </div>
        <div v-if="selectedTask === task.id" class="study-task-fields">
          <label :for="`study-task-${task.id}`">{{ t('proto.studyTaskName') }}</label
          ><input
            :id="`study-task-${task.id}`"
            v-model="task.title"
            autocomplete="off"
            :name="`study-task-${task.id}`"
            maxlength="120"
            :disabled="disabled"
            required
          />
          <label :for="`study-objective-${task.id}`">{{ t('proto.studyObjective') }}</label
          ><textarea
            :id="`study-objective-${task.id}`"
            v-model="task.objective"
            autocomplete="off"
            :name="`study-objective-${task.id}`"
            rows="3"
            maxlength="2000"
            :disabled="disabled"
          />
          <details>
            <summary>{{ t('proto.studyPrerequisites') }} / {{ t('proto.studyReset') }}</summary>
            <label :for="`study-prerequisites-${task.id}`">{{
              t('proto.studyPrerequisites')
            }}</label
            ><textarea
              :id="`study-prerequisites-${task.id}`"
              v-model="task.prerequisites"
              autocomplete="off"
              :name="`study-prerequisites-${task.id}`"
              rows="2"
              maxlength="2000"
              :disabled="disabled"
            />
            <label :for="`study-reset-${task.id}`">{{ t('proto.studyReset') }}</label
            ><textarea
              :id="`study-reset-${task.id}`"
              v-model="task.resetNote"
              autocomplete="off"
              :name="`study-reset-${task.id}`"
              rows="2"
              maxlength="2000"
              :disabled="disabled"
            />
          </details>
          <h3>{{ t('proto.studySteps') }}</h3>
          <ol class="study-records">
            <li v-for="(step, stepIndex) in task.steps" :key="step.id" class="study-step">
              <div class="study-item-heading">
                <strong>{{ t('proto.studyStepItem', { index: stepIndex + 1 }) }}</strong>
                <div class="study-actions">
                  <a-button
                    :disabled="disabled || !stepIndex"
                    :aria-label="`${t('proto.studyUp')} ${stepIndex + 1}`"
                    @click="moveStudyItem(task.steps, stepIndex, -1)"
                    >{{ t('proto.studyUp') }}</a-button
                  ><a-button
                    :disabled="disabled || stepIndex === task.steps.length - 1"
                    :aria-label="`${t('proto.studyDown')} ${stepIndex + 1}`"
                    @click="moveStudyItem(task.steps, stepIndex, 1)"
                    >{{ t('proto.studyDown') }}</a-button
                  ><a-button
                    danger
                    :disabled="disabled"
                    :aria-label="`${t('proto.studyRemove')} ${stepIndex + 1}`"
                    @click="task.steps.splice(stepIndex, 1)"
                    >{{ t('proto.studyRemove') }}</a-button
                  >
                </div>
              </div>
              <label :for="`study-page-${step.id}`">{{ t('proto.studyPage') }}</label
              ><select
                :id="`study-page-${step.id}`"
                v-model="step.pageId"
                autocomplete="off"
                :disabled="disabled"
              >
                <option v-for="page in pages" :key="page.pageId" :value="page.pageId">
                  {{ page.name }} — {{ page.path }}
                </option>
              </select>
              <label :for="`study-narration-${step.id}`">{{ t('proto.studyNarration') }}</label
              ><textarea
                :id="`study-narration-${step.id}`"
                v-model="step.narration"
                autocomplete="off"
                :name="`study-narration-${step.id}`"
                rows="3"
                maxlength="2000"
                :disabled="disabled"
              />
            </li>
          </ol>
          <a-button
            :disabled="disabled || task.steps.length >= 12 || stepCount >= 48 || !pages.length"
            @click="addStep(index)"
            >{{ t('proto.studyAddStep') }}</a-button
          >
        </div>
      </div>
    </section>
    <section v-else>
      <div class="study-toolbar">
        <h2>
          {{ t('proto.studyQuestions') }} <span>{{ form.questions.length }}/8</span>
        </h2>
        <a-button :disabled="disabled || form.questions.length >= 8" @click="addQuestion">{{
          t('proto.studyAddQuestion')
        }}</a-button>
      </div>
      <p v-if="!form.questions.length" class="study-empty">{{ t('proto.studyNoQuestions') }}</p>
      <div v-for="(question, index) in form.questions" :key="question.id" class="study-edit-item">
        <div class="study-item-heading">
          <button
            class="study-disclosure"
            :aria-expanded="selectedQuestion === question.id"
            @click="selectedQuestion = selectedQuestion === question.id ? '' : question.id"
          >
            {{ question.prompt || t('proto.studyQuestionItem', { index: index + 1 }) }}
          </button>
          <div class="study-actions">
            <a-button
              :disabled="disabled || !index"
              :aria-label="`${t('proto.studyUp')} ${index + 1}`"
              @click="moveStudyItem(form.questions, index, -1)"
              >{{ t('proto.studyUp') }}</a-button
            ><a-button
              :disabled="disabled || index === form.questions.length - 1"
              :aria-label="`${t('proto.studyDown')} ${index + 1}`"
              @click="moveStudyItem(form.questions, index, 1)"
              >{{ t('proto.studyDown') }}</a-button
            ><a-button
              danger
              :disabled="disabled"
              :aria-label="`${t('proto.studyRemove')} ${index + 1}`"
              @click="form.questions.splice(index, 1)"
              >{{ t('proto.studyRemove') }}</a-button
            >
          </div>
        </div>
        <div v-if="selectedQuestion === question.id" class="study-task-fields">
          <label :for="`study-question-${question.id}`">{{ t('proto.studyQuestion') }}</label
          ><textarea
            :id="`study-question-${question.id}`"
            v-model="question.prompt"
            autocomplete="off"
            :name="`study-question-${question.id}`"
            rows="2"
            maxlength="500"
            :disabled="disabled"
            required
          />
          <label :for="`study-type-${question.id}`">{{ t('proto.studyQuestionType') }}</label
          ><select
            :id="`study-type-${question.id}`"
            v-model="question.type"
            autocomplete="off"
            :name="`study-type-${question.id}`"
            :disabled="disabled"
            @change="changeType(question)"
          >
            <option value="singleChoice">{{ t('proto.studySingleChoice') }}</option>
            <option value="rating">{{ t('proto.studyRating') }}</option>
            <option value="text">{{ t('proto.studyText') }}</option>
          </select>
          <label class="study-check"
            ><input
              v-model="question.required"
              autocomplete="off"
              type="checkbox"
              :disabled="disabled"
            />{{ t('proto.studyRequired') }}</label
          >
          <div v-if="question.type === 'singleChoice'">
            <div
              v-for="(option, optionIndex) in question.options"
              :key="option.id"
              class="study-option"
            >
              <label :for="`study-option-${option.id}`">{{
                t('proto.studyOption', { index: optionIndex + 1 })
              }}</label>
              <div class="study-option-field">
                <input
                  :id="`study-option-${option.id}`"
                  v-model="option.label"
                  autocomplete="off"
                  :name="`study-option-${option.id}`"
                  maxlength="200"
                  :disabled="disabled"
                  required
                /><a-button
                  danger
                  :disabled="disabled || question.options.length <= 2"
                  :aria-label="`${t('proto.studyRemove')} ${t('proto.studyOption', { index: optionIndex + 1 })}`"
                  @click="question.options.splice(optionIndex, 1)"
                  >{{ t('proto.studyRemove') }}</a-button
                >
              </div>
            </div>
            <a-button
              :disabled="disabled || question.options.length >= 8"
              @click="question.options.push({ id: secureId(), label: '' })"
              >{{ t('proto.studyAddOption') }}</a-button
            >
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
