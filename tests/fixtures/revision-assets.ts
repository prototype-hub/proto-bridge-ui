import { createHash } from 'node:crypto'
import { zipSync } from 'fflate'
import type { Revision } from '../../src/modules/protohub-manager-ui/types'
import type {
  RevisionAsset,
  RevisionAssetPage,
} from '../../src/modules/protohub-manager-ui/types/revision-asset'

/** UI fixtures only. Permission, original bytes and filesystem integrity need the real backend. */
export const assetFiles = Array.from({ length: 53 }, (_, index) => {
  const path =
    index === 0 ? 'images/首页 图标.svg' : `images/icon-${String(index).padStart(2, '0')}.svg`
  const bytes = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><title>${index}</title><rect width="16" height="16" fill="#1677ff"/></svg>`,
  )
  const asset: RevisionAsset = {
    path,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mediaType: 'image/svg+xml',
  }
  return { asset, bytes }
}).sort((left, right) =>
  left.asset.path < right.asset.path ? -1 : left.asset.path > right.asset.path ? 1 : 0,
)

export function fixtureAssets(revision: Revision, query: URLSearchParams): RevisionAssetPage {
  const pageIndex = Number(query.get('pageIndex') || 0),
    pageSize = Number(query.get('pageSize') || 50)
  const search = (query.get('search') || '').toLowerCase()
  const matching = assetFiles.filter(({ asset }) => asset.path.toLowerCase().includes(search))
  return {
    projectId: revision.projectId,
    versionId: revision.versionId,
    revisionId: revision.id,
    manifestSha256: revision.manifestSha256,
    pageIndex,
    pageSize,
    total: matching.length,
    totalBytes: matching.reduce((sum, { asset }) => sum + asset.size, 0),
    assetCount: assetFiles.length,
    assetBytes: assetFiles.reduce((sum, { asset }) => sum + asset.size, 0),
    data: matching
      .slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
      .map((file) => file.asset),
  }
}
export function fixtureAssetDownload(
  revision: Revision,
  format: string,
  paths: string[],
  all: boolean,
) {
  const selected = all
    ? assetFiles
    : paths.map((path) => assetFiles.find((file) => file.asset.path === path)!)
  if (!selected.length || selected.some((file) => !file)) return undefined
  const manifest = {
    formatVersion: 1,
    projectId: revision.projectId,
    versionId: revision.versionId,
    revisionId: revision.id,
    manifestSha256: revision.manifestSha256,
    total: selected.length,
    totalBytes: selected.reduce((sum, file) => sum + file.asset.size, 0),
    files: selected.map((file) => file.asset),
  }
  const json = Buffer.from(JSON.stringify(manifest, null, 2))
  if (format === 'manifest')
    return { bytes: json, filename: 'assets.json', contentType: 'application/json' }
  if (format === 'file')
    return selected.length === 1
      ? {
          bytes: selected[0]!.bytes,
          filename: selected[0]!.asset.path.split('/').pop()!,
          contentType: selected[0]!.asset.mediaType,
        }
      : undefined
  return {
    bytes: zipSync(
      Object.fromEntries([
        ...selected.map((file) => [file.asset.path, file.bytes]),
        ['META-INF/prototype-assets.json', json],
      ]),
    ),
    filename: 'original-assets.zip',
    contentType: 'application/zip',
  }
}
