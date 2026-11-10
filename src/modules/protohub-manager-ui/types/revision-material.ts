export interface MaterialSource {
  sourceTool?: string | null
  sourceName?: string | null
  sourceUrl?: string | null
  sourceNotes?: string | null
}
export type MaterialType = 'prototype' | 'image' | 'document'
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
}
export interface MaterialQuery {
  pageIndex: number
  pageSize: number
  materialType?: MaterialType
}
