<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button as AButton, Pagination as APagination } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { StudyDefinition, StudyAggregate, MemberStudyResponse } from '../types/usability-study'
import UsabilityResponseContent from './UsabilityResponseContent.vue'
const props = defineProps<{
  definition: StudyDefinition
  aggregate: StudyAggregate
  responses: MemberStudyResponse[]
  pageIndex: number
  total: number
  loading: boolean
}>()
const emit = defineEmits<{ page: [index: number]; export: [] }>()
const { t } = useI18n()
const tab = ref<'summary' | 'responses'>('summary'),
  selected = ref('')
const response = computed(() => props.responses.find((item) => item.id === selected.value))
watch(
  () => props.responses,
  () => {
    selected.value = ''
  },
)
</script>
<template>
  <section>
    <div class="study-toolbar">
      <h2>{{ t('proto.studySubmittedCount', { count: aggregate.submittedCount }) }}</h2>
      <a-button :disabled="loading" @click="emit('export')">{{ t('proto.studyExport') }}</a-button>
    </div>
    <div class="study-tabs" :aria-label="t('proto.studyResults')">
      <a-button
        :type="tab === 'summary' ? 'primary' : 'default'"
        :aria-pressed="tab === 'summary'"
        @click="tab = 'summary'"
        >{{ t('proto.studySummary') }}</a-button
      ><a-button
        :type="tab === 'responses' ? 'primary' : 'default'"
        :aria-pressed="tab === 'responses'"
        @click="tab = 'responses'"
        >{{ t('proto.studyResponses') }}</a-button
      >
    </div>
    <template v-if="tab === 'summary'">
      <p class="muted">{{ t('proto.studyCountsHint') }}</p>
      <section v-for="(task, index) in aggregate.tasks" :key="index" class="study-aggregate-item">
        <h3>{{ task.title }}</h3>
        <dl class="study-counts">
          <div>
            <dt>{{ t('proto.studyOutcome_completed') }}</dt>
            <dd>{{ task.completed }}</dd>
          </div>
          <div>
            <dt>{{ t('proto.studyOutcome_not_completed') }}</dt>
            <dd>{{ task.notCompleted }}</dd>
          </div>
          <div>
            <dt>{{ t('proto.studyOutcome_skipped') }}</dt>
            <dd>{{ task.skipped }}</dd>
          </div>
          <div>
            <dt>{{ t('proto.studyNotAnswered') }}</dt>
            <dd>{{ task.missing }}</dd>
          </div>
        </dl>
      </section>
      <section
        v-for="(question, index) in aggregate.questions"
        :key="index"
        class="study-aggregate-item"
      >
        <h3>{{ question.prompt }}</h3>
        <p class="muted">
          {{ t('proto.studyAnswered', { count: question.answered }) }} ·
          {{ t('proto.studyMissing', { count: question.missing }) }}
        </p>
        <dl class="study-distribution">
          <div v-for="(option, optionIndex) in question.options" :key="optionIndex">
            <dt>{{ option.label }}</dt>
            <dd>{{ t('proto.studyCount', { count: option.count }) }}</dd>
          </div>
        </dl>
      </section>
      <p v-if="aggregate.excludedTextQuestionCount" class="muted">
        {{ t('proto.studyExcludedText', { count: aggregate.excludedTextQuestionCount }) }}
      </p>
      <p class="muted">{{ t('proto.studyStructuredOnly') }}</p>
    </template>
    <template v-else-if="response"
      ><div class="study-toolbar">
        <h3>{{ t('proto.studyResponseDetail') }}</h3>
        <a-button @click="selected = ''">{{ t('proto.studyResponses') }}</a-button>
      </div>
      <usability-response-content :definition="definition" :answers="response"
    /></template>
    <template v-else
      ><p v-if="!responses.length" class="study-empty">{{ t('proto.studyNoResponses') }}</p>
      <ul class="study-records">
        <li v-for="item in responses" :key="item.id">
          <button class="study-record" @click="selected = item.id">
            <strong>{{ t('proto.studyViewResponse') }}</strong
            ><span>{{
              t('proto.studyResponseCoverage', {
                tasks: item.taskAnswers.length,
                questions: item.answers.length,
              })
            }}</span>
          </button>
        </li>
      </ul>
      <a-pagination
        v-if="total > 20"
        :current="pageIndex + 1"
        :page-size="20"
        :total="total"
        :show-size-changer="false"
        :disabled="loading"
        @change="emit('page', $event - 1)"
    /></template>
  </section>
</template>
