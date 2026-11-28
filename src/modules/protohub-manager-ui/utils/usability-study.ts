import { secureId } from '@/shared/utils/secure-id'
import { isRecord } from '@/shared/api/errors'
import type { DemoScript } from '../types/demo-script'
import type {
  StudyDefinition,
  StudyAnswers,
  StudyTask,
  StudyQuestion,
  StudyQuestionAnswer,
} from '../types/usability-study'
import { demoText } from './demo-script'
export function blankStudy(): StudyDefinition {
  return { title: '', introduction: '', consentText: '', tasks: [], questions: [] }
}
export function blankStudyAnswers(): StudyAnswers {
  return { taskAnswers: [], answers: [], feedback: '' }
}
export function copyStudy(value: StudyDefinition): StudyDefinition {
  return {
    title: value.title,
    introduction: value.introduction,
    consentText: value.consentText,
    tasks: value.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      objective: task.objective,
      prerequisites: task.prerequisites,
      resetNote: task.resetNote,
      steps: task.steps.map(({ id, pageId, narration }) => ({ id, pageId, narration })),
    })),
    questions: value.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      type: question.type,
      required: question.required,
      options: question.options.map(({ id, label }) => ({ id, label })),
    })),
  }
}
export function taskFromScript(script: DemoScript): StudyTask {
  return {
    id: secureId(),
    title: script.title,
    objective: script.objective,
    prerequisites: script.prerequisites,
    resetNote: script.resetNote,
    steps: script.steps.map((step) => ({
      id: secureId(),
      pageId: step.pageId,
      narration: step.narration,
    })),
  }
}
const stable = (id: unknown): id is string =>
  typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)
const unique = (values: { id: string }[]) =>
  values.every((value) => stable(value.id)) &&
  new Set(values.map((value) => value.id)).size === values.length
export function validStudy(value: StudyDefinition, pages: Set<string>, opening = false) {
  return (
    demoText(value.title, 120, true) &&
    demoText(value.introduction, 4000) &&
    demoText(value.consentText, 4000, true) &&
    Array.isArray(value.tasks) &&
    value.tasks.length <= 12 &&
    (!opening || value.tasks.length > 0) &&
    unique(value.tasks) &&
    value.tasks.reduce((sum, task) => sum + task.steps.length, 0) <= 48 &&
    value.tasks.every(
      (task) =>
        demoText(task.title, 120, true) &&
        demoText(task.objective, 2000) &&
        demoText(task.prerequisites, 2000) &&
        demoText(task.resetNote, 2000) &&
        Array.isArray(task.steps) &&
        task.steps.length > 0 &&
        task.steps.length <= 12 &&
        unique(task.steps) &&
        task.steps.every((step) => pages.has(step.pageId) && demoText(step.narration, 2000)),
    ) &&
    Array.isArray(value.questions) &&
    value.questions.length <= 8 &&
    unique(value.questions) &&
    value.questions.every(validQuestion) &&
    new TextEncoder().encode(JSON.stringify(copyStudy(value))).length <= 128 * 1024
  )
}
function validQuestion(question: StudyQuestion) {
  return (
    demoText(question.prompt, 500, true) &&
    typeof question.required === 'boolean' &&
    Array.isArray(question.options) &&
    (question.type === 'singleChoice'
      ? question.options.length >= 2 &&
        question.options.length <= 8 &&
        unique(question.options) &&
        question.options.every((option) => demoText(option.label, 200, true))
      : ['rating', 'text'].includes(question.type) && question.options.length === 0)
  )
}
export function validStudyAnswers(
  value: StudyAnswers,
  definition: StudyDefinition,
  submit = false,
) {
  if (
    !demoText(value.feedback, 2000) ||
    value.taskAnswers.length > definition.tasks.length ||
    value.answers.length > definition.questions.length ||
    new Set(value.taskAnswers.map((answer) => answer.taskId)).size !== value.taskAnswers.length ||
    new Set(value.answers.map((answer) => answer.questionId)).size !== value.answers.length
  )
    return false
  return (
    (!submit || value.taskAnswers.length === definition.tasks.length) &&
    value.taskAnswers.every(
      (answer) =>
        definition.tasks.some((task) => task.id === answer.taskId) &&
        ['completed', 'not_completed', 'skipped'].includes(answer.outcome) &&
        demoText(answer.feedback, 2000),
    ) &&
    value.answers.every((answer) => {
      const question = definition.questions.find((item) => item.id === answer.questionId)
      if (!question) return false
      return question.type === 'singleChoice'
        ? answer.rating === undefined &&
            answer.text === undefined &&
            question.options.some((option) => option.id === answer.optionId)
        : question.type === 'rating'
          ? answer.optionId === undefined &&
            answer.text === undefined &&
            Number.isInteger(answer.rating) &&
            answer.rating! >= 1 &&
            answer.rating! <= 5
          : answer.optionId === undefined &&
            answer.rating === undefined &&
            demoText(answer.text, 2000, submit && question.required)
    }) &&
    (!submit ||
      definition.questions.every(
        (question) =>
          !question.required || value.answers.some((answer) => answer.questionId === question.id),
      )) &&
    new TextEncoder().encode(
      JSON.stringify({
        taskAnswers: value.taskAnswers,
        answers: value.answers,
        feedback: value.feedback,
      }),
    ).length <=
      64 * 1024
  )
}
export function moveStudyItem<T>(items: T[], index: number, offset: number) {
  const next = index + offset
  if (index < 0 || next < 0 || next >= items.length) return
  const [item] = items.splice(index, 1)
  items.splice(next, 0, item)
}

/** Only HTTP's unused null values become absent keys; unexpected fields and scalar types are rejected. */
export function normalizeStudyAnswerValues(value: unknown): StudyQuestionAnswer[] {
  if (!Array.isArray(value) || value.length > 8) throw new Error('Invalid study answers')
  return value.map((item) => {
    if (
      !isRecord(item) ||
      !stable(item.questionId) ||
      Object.keys(item).some((key) => !['questionId', 'optionId', 'rating', 'text'].includes(key))
    )
      throw new Error('Invalid study answer')
    const result: StudyQuestionAnswer = { questionId: item.questionId }
    if (item.optionId !== null && item.optionId !== undefined) {
      if (!stable(item.optionId)) throw new Error('Invalid study option')
      result.optionId = item.optionId
    }
    if (item.rating !== null && item.rating !== undefined) {
      if (
        typeof item.rating !== 'number' ||
        !Number.isInteger(item.rating) ||
        item.rating < 1 ||
        item.rating > 5
      )
        throw new Error('Invalid study rating')
      result.rating = item.rating
    }
    if (item.text !== null && item.text !== undefined) {
      if (!demoText(item.text, 2000)) throw new Error('Invalid study text')
      result.text = item.text
    }
    if (Object.keys(result).length !== 2) throw new Error('Invalid study answer values')
    return result
  })
}
