export interface MaterialSource {
  sourceTool?: string | null
  sourceName?: string | null
  sourceUrl?: string | null
  sourceNotes?: string | null
}
export type MaterialType = 'prototype' | 'image' | 'document'
export type MaterialTextStatus =
  | 'NOT_EXTRACTED'
  | 'READY'
  | 'EMPTY'
  | 'UNSUPPORTED'
  | 'ENCRYPTED'
  | 'LIMIT_EXCEEDED'
  | 'FAILED'
export interface MaterialText {
  id: string
  status: MaterialTextStatus
  content: string
  characterCount: number
  extractedAt: number | null
  extractorVersion: string | null
}
export interface RevisionMaterial extends MaterialSource {
  id: string
  projectId: string
  versionId: string
  revisionId: string
  materialType: MaterialType
  fileName: string
  mediaType: string
  fileSize: number
  sha256: string
  configVersion: number
  createdBy: string
  updatedBy: string
  createdAt: number
  updatedAt: number
  textStatus?: MaterialTextStatus
  textCharacterCount?: number
  textExtractedAt?: number | null
  textExtractorVersion?: string | null
}
export interface MaterialQuery {
  pageIndex: number
  pageSize: number
  materialType?: MaterialType
}
