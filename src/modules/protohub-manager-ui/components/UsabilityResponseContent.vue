<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { StudyDefinition, StudyAnswers } from '../types/usability-study'
const props = defineProps<{ definition: StudyDefinition; answers: StudyAnswers }>()
const { t } = useI18n()
function response(questionId: string) {
  const question = props.definition.questions.find((item) => item.id === questionId),
    answer = props.answers.answers.find((item) => item.questionId === questionId)
  if (!answer || !question) return t('proto.studyNotAnswered')
  return question.type === 'text'
    ? answer.text || t('proto.studyNotAnswered')
    : question.type === 'rating'
      ? t('proto.studyRatingValue', { value: answer.rating })
      : question.options.find((option) => option.id === answer.optionId)?.label ||
        t('proto.studyNotAnswered')
}
</script>
<template>
  <section class="study-response-content">
    <h3>{{ t('proto.studyTasks') }}</h3>
    <dl class="study-answer-list">
      <template v-for="task in definition.tasks" :key="task.id"
        ><dt>{{ task.title }}</dt>
        <dd>
          {{
            answers.taskAnswers.find((answer) => answer.taskId === task.id)
              ? t(
                  `proto.studyOutcome_${answers.taskAnswers.find((answer) => answer.taskId === task.id)!.outcome}`,
                )
              : t('proto.studyNotAnswered')
          }}
          <p
            v-if="answers.taskAnswers.find((answer) => answer.taskId === task.id)?.feedback"
            class="study-text"
          >
            {{ answers.taskAnswers.find((answer) => answer.taskId === task.id)?.feedback }}
          </p>
        </dd></template
      >
    </dl>
    <template v-if="definition.questions.length"
      ><h3>{{ t('proto.studyQuestions') }}</h3>
      <dl class="study-answer-list">
        <template v-for="question in definition.questions" :key="question.id"
          ><dt>{{ question.prompt }}</dt>
          <dd class="study-text">{{ response(question.id) }}</dd></template
        >
      </dl></template
    >
    <template v-if="answers.feedback"
      ><h3>{{ t('proto.studyGeneralFeedback') }}</h3>
      <p class="study-text">{{ answers.feedback }}</p></template
    >
  </section>
</template>
