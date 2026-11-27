import { isRecord } from '../../../shared/api/errors'
import { validLinkUrl } from './material-source'
import type { CodeMappingDraft, CodeMappingText, CodeMappingPackage } from '../types/code-mapping'

export const codeMappingFields = [
  'alias',
  'repositoryPath',
  'repositoryUrl',
  'documentationUrl',
  'snippet',
  'framework',
  'frameworkVersion',
] as const
export type CodeMappingField = (typeof codeMappingFields)[number]
export interface CodeMappingIssue {
  index?: number
  field?: CodeMappingField
  reason: 'required' | 'text' | 'url' | 'format' | 'size' | 'count' | 'fields' | 'json'
}
const limits: Record<CodeMappingField, number> = {
  alias: 120,
  repositoryPath: 2048,
  repositoryUrl: 2048,
  documentationUrl: 2048,
  snippet: 16000,
  framework: 120,
  frameworkVersion: 120,
}
export const codeMappingByteLimit = 1048576
export const codeMappingFormat = 'prototype-hub-code-mapping-cards' as const
export const emptyCodeMapping = (): CodeMappingDraft => ({
  alias: '',
  repositoryPath: '',
  repositoryUrl: '',
  documentationUrl: '',
  snippet: '',
  framework: '',
  frameworkVersion: '',
  description: null,
})
/** Project response fields explicitly: resolved source status and internal identities never enter writes or files. */
export function codeMappingText(value: CodeMappingText): CodeMappingText {
  return {
    alias: value.alias,
    repositoryPath: value.repositoryPath,
    repositoryUrl: value.repositoryUrl,
    documentationUrl: value.documentationUrl,
    snippet: value.snippet,
    framework: value.framework,
    frameworkVersion: value.frameworkVersion,
  }
}
export function codeMappingDraft(value: CodeMappingDraft): CodeMappingDraft {
  return {
    ...codeMappingText(value),
    description: value.description
      ? { id: value.description.id, expectedVersion: value.description.expectedVersion }
      : null,
  }
}
export function codeMappingIssues(value: unknown): CodeMappingIssue[] {
  if (!isRecord(value)) return [{ reason: 'fields' }]
  const result: CodeMappingIssue[] = []
  for (const field of codeMappingFields) {
    const text = value[field]
    if (typeof text !== 'string' || text.length > limits[field] || text.includes('\0')) {
      result.push({ field, reason: 'text' })
      continue
    }
    if ((field === 'alias' || field === 'repositoryPath') && !/[^\s\p{Z}\uFEFF]/u.test(text))
      result.push({ field, reason: 'required' })
    if ((field === 'repositoryUrl' || field === 'documentationUrl') && text && !validLinkUrl(text))
      result.push({ field, reason: 'url' })
  }
  return result
}
/** Parse portable files locally without merging arbitrary object keys or accepting internal/source identities. */
export function parseCodeMappingPackage(text: string): {
  value?: CodeMappingPackage
  issues: CodeMappingIssue[]
} {
  if (!text || new TextEncoder().encode(text).byteLength > codeMappingByteLimit)
    return { issues: [{ reason: 'size' }] }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { issues: [{ reason: 'json' }] }
  }
  if (
    !isRecord(raw) ||
    Object.keys(raw).length !== 3 ||
    Object.keys(raw).some((key) => !['format', 'schemaVersion', 'cards'].includes(key)) ||
    raw.format !== codeMappingFormat ||
    raw.schemaVersion !== 1
  )
    return { issues: [{ reason: 'format' }] }
  if (!Array.isArray(raw.cards) || raw.cards.length < 1 || raw.cards.length > 50)
    return { issues: [{ reason: 'count' }] }
  const issues: CodeMappingIssue[] = []
  raw.cards.forEach((card, index) => {
    if (
      !isRecord(card) ||
      Object.keys(card).length !== codeMappingFields.length ||
      Object.keys(card).some((key) => !codeMappingFields.some((field) => key === field))
    )
      issues.push({ index, reason: 'fields' })
    else issues.push(...codeMappingIssues(card).map((issue) => ({ ...issue, index })))
  })
  return issues.length
    ? { issues }
    : {
        value: {
          format: codeMappingFormat,
          schemaVersion: 1,
          cards: raw.cards.map((card) => codeMappingText(card as CodeMappingText)),
        },
        issues,
      }
}
