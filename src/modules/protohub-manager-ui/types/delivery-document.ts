export interface DeliverySourceRef {
  id: string
  expectedVersion: number
}
export interface DeliveryMaterialRef extends DeliverySourceRef {
  includeText: boolean
}
export interface DeliveryImageRef extends DeliverySourceRef {
  caption: string
}
export interface DeliveryPageInput {
  pageId: string
  descriptions: DeliverySourceRef[]
  materials: DeliveryMaterialRef[]
  images: DeliveryImageRef[]
  checks: DeliverySourceRef[]
  body?: string
  sourceFingerprint?: string
}
export interface DeliveryDocumentInput {
  locale: 'zh' | 'en'
  title: string
  introduction: string
  pages: DeliveryPageInput[]
}
export interface DeliveryDocumentPage extends DeliveryPageInput {
  name: string
  path: string
  body: string
  sourceFingerprint: string
}
export interface DeliveryDocument extends Omit<DeliveryDocumentInput, 'pages'> {
  projectId: string
  versionId: string
  revisionId: string
  pages: DeliveryDocumentPage[]
}
