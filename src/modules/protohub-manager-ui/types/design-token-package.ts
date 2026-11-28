import type { Project, Revision } from './index'
import type { MaterialSource } from './revision-material'

export interface DesignTokenScope {
  actorId: string
  project: Project
  revision: Revision
}
export interface DesignTokenTarget {
  versionId: string
  revisionId: string
}
export interface DesignTokenIssue {
  code: string
  severity: 'error' | 'warning'
  pointer: string
  message: string
}
export interface DesignTokenReport {
  valid: boolean
  issues: DesignTokenIssue[]
  truncated: boolean
}
export interface DesignTokenAlias {
  reference: string
  targetPath: string[] | null
  status: 'resolved' | 'missing' | 'cycle' | 'invalid'
}
export interface DesignToken {
  path: string[]
  pointer: string
  name: string
  type: string | null
  declaredValue: unknown
  resolvedValue: unknown
  description: string | null
  extensions: unknown
  deprecated: unknown
  aliases: DesignTokenAlias[]
}
export interface DesignTokenGroup {
  path: string[]
  pointer: string
  description: string | null
  type: string | null
  extensions: unknown
}
export interface DesignTokenDocument extends DesignTokenReport {
  format: 'tokens' | 'resolver'
  standardVersion: string
  validatorVersion: string
  tokenCount: number
  groupCount: number
  sets: { name: string; description: string | null; tokenPaths: string[][] }[]
  modifiers: {
    name: string
    description: string | null
    contexts: string[]
    defaultContext: string | null
  }[]
  inputs: Record<string, string>
  groups: DesignTokenGroup[]
  tokens: DesignToken[]
}
export interface DesignTokenPackage extends MaterialSource, DesignTokenTarget {
  id: string
  projectId: string
  fileName: string
  fileSize: number
  sha256: string
  standardVersion: string
  validatorVersion: string
  valid: boolean
  tokenCount: number
  groupCount: number
  issueCount: number
  report: DesignTokenReport
  configVersion: number
  createdBy: string
  updatedBy: string
  createdAt: number
  updatedAt: number
}
export interface DesignTokenImportResult {
  id: string
  status: 'current' | 'missing'
  package: DesignTokenPackage | null
}
export interface DesignTokenMutation {
  expectedVersion: number
  clientRequestId: string
}
