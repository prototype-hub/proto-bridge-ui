import type { PageResult } from '@/shared/api/types'

export interface CopyInventorySnapshot {
  projectId: string
  versionId: string
  revisionId: string
  pageId: string
  pagePath: string
  manifestSha256: string
  fileSha256: string
  snapshotId: string | null
  extractorVersion: number | null
  extractionState: 'NOT_EXTRACTED' | 'READY' | 'EMPTY' | 'LIMIT_EXCEEDED'
  limitReason: 'SOURCE_BYTES' | 'STATIC_ENTRIES' | 'STATIC_OCCURRENCES' | 'STATIC_TEXT' | null
  staticComplete: boolean
  dynamicTextGap: boolean
  staticCount: number
  manualCount: number
  configVersion: number | null
  extractedAt: number | null
}
export interface CopyInventoryEntry {
  id: string
  kind: 'STATIC' | 'MANUAL'
  text: string
  businessTerm: string
  note: string
  requirementUrl: string
  occurrenceCount: number
  occurrences: { ordinal: number; sourceKind: CopySourceKind }[]
  configVersion: number
  createdAt: number
  updatedAt: number
}
export type CopySourceKind =
  | 'DOCUMENT_TITLE'
  | 'TEXT'
  | 'ALT'
  | 'TITLE'
  | 'PLACEHOLDER'
  | 'ARIA_LABEL'
  | 'BUTTON_VALUE'
export interface CopyInventoryQuery {
  pageIndex: number
  pageSize: number
  keyword?: string
  kind?: 'STATIC' | 'MANUAL'
  hasRequirement?: boolean
}
export interface CopyInventoryPage extends PageResult<CopyInventoryEntry> {
  snapshot: CopyInventorySnapshot
}
export interface CopyInventoryInput {
  clientRequestId: string
  text?: string
  businessTerm: string
  note: string
  requirementUrl: string
}
export interface CopyInventoryMutation {
  inventoryVersion: number
  entry: CopyInventoryEntry
}
export interface CopyInventoryTarget {
  versionId: string
  revisionId: string
  pageId: string
}
