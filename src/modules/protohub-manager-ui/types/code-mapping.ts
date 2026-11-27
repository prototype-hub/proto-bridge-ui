import type { Project, Revision, ReviewPage, WorkspaceContext } from './index'

export interface CodeMappingScope {
  actorId: string
  project: Project
  revision: Revision
  context: WorkspaceContext
  initialPage?: ReviewPage
}
export interface CodeMappingTarget {
  versionId: string
  revisionId: string
  pageId: string
}
export interface CodeMappingText {
  alias: string
  repositoryPath: string
  repositoryUrl: string
  documentationUrl: string
  snippet: string
  framework: string
  frameworkVersion: string
}
export interface CodeMappingDescriptionRef {
  id: string
  expectedVersion: number
}
export interface CodeMappingDraft extends CodeMappingText {
  description: CodeMappingDescriptionRef | null
}
export interface CodeMappingResolvedDescription extends CodeMappingDescriptionRef {
  status: 'current' | 'changed' | 'missing'
  currentVersion: number | null
  title: string | null
}
export interface CodeMappingCard extends CodeMappingText, CodeMappingTarget {
  id: string
  projectId: string
  description: CodeMappingResolvedDescription | null
  configVersion: number
  createdAt: number
  updatedAt: number
}
export interface CodeMappingCreate extends CodeMappingDraft {
  clientRequestId: string
}
export interface CodeMappingUpdate extends CodeMappingCreate {
  expectedVersion: number
}
export interface CodeMappingDelete {
  clientRequestId: string
  expectedVersion: number
}
export interface CodeMappingPackage {
  format: 'prototype-hub-code-mapping-cards'
  schemaVersion: 1
  cards: CodeMappingText[]
}
export interface CodeMappingImport extends Omit<CodeMappingPackage, 'cards'> {
  clientRequestId: string
  cards: CodeMappingDraft[]
}
export interface CodeMappingImportResult {
  items: { id: string; status: 'current' | 'missing'; card: CodeMappingCard | null }[]
}
