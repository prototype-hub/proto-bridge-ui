/** Original image files recorded by one immutable revision manifest. */
export interface RevisionAsset {
  path: string
  size: number
  sha256: string
  mediaType: string
}
export interface RevisionAssetPage {
  projectId: string
  versionId: string
  revisionId: string
  manifestSha256: string
  pageIndex: number
  pageSize: number
  total: number
  totalBytes: number
  assetCount: number
  assetBytes: number
  data: RevisionAsset[]
}
export interface RevisionAssetSelection {
  expectedManifestSha256: string
  all: boolean
  paths: string[]
}
