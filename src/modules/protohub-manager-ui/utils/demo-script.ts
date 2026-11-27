import type { DemoScriptDraft, DemoScriptTarget } from '../types/demo-script'
import { previewIdentity } from './preview-location'

export function demoTarget(query: Record<string, unknown>): DemoScriptTarget | null | undefined {
  if (query.tool !== 'demo')
    return query.scriptId === undefined && query.stepId === undefined ? undefined : null
  if (query.threadId !== undefined || query.materialId !== undefined) return null
  const revisionId = previewIdentity(query.revisionId)
  const scriptId = previewIdentity(query.scriptId)
  const stepId = previewIdentity(query.stepId)
  if (!revisionId || scriptId === null || stepId === null) return null
  if (scriptId === undefined && stepId === undefined) return { revisionId }
  return scriptId && scriptId.length <= 128 && stepId && /^[A-Za-z0-9_-]{1,64}$/.test(stepId)
    ? { revisionId, scriptId, stepId }
    : null
}
export function demoQuery(target: DemoScriptTarget) {
  return {
    tool: 'demo',
    revisionId: target.revisionId,
    ...(target.scriptId && target.stepId
      ? { scriptId: target.scriptId, stepId: target.stepId }
      : {}),
  }
}
export function blankDemoScript(): DemoScriptDraft {
  return {
    title: '',
    objective: '',
    prerequisites: '',
    resetNote: '',
    shareEnabled: false,
    steps: [],
  }
}
export function demoText(value: unknown, max: number, required = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= max &&
    !value.includes('\0') &&
    (!required || value.replace(/[\s\p{Z}\uFEFF]/gu, '').length > 0)
  )
}
export function validDemoScript(draft: DemoScriptDraft, pageIds: Set<string>) {
  return (
    demoText(draft.title, 120, true) &&
    demoText(draft.objective, 2000, true) &&
    demoText(draft.prerequisites, 2000) &&
    demoText(draft.resetNote, 2000) &&
    typeof draft.shareEnabled === 'boolean' &&
    Array.isArray(draft.steps) &&
    draft.steps.length >= 1 &&
    draft.steps.length <= 50 &&
    new Set(draft.steps.map((step) => step?.id)).size === draft.steps.length &&
    draft.steps.every(
      (step) =>
        step &&
        typeof step.id === 'string' &&
        /^[A-Za-z0-9_-]{1,64}$/.test(step.id) &&
        typeof step.pageId === 'string' &&
        step.pageId.length <= 128 &&
        pageIds.has(step.pageId) &&
        demoText(step.narration, 2000),
    )
  )
}
