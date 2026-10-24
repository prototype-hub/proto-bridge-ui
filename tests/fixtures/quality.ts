import type { Revision, RevisionQuality } from '../../src/modules/protohub-manager-ui/types'

/** Deterministic UI fixture only; the real scanner and permission checks live in backend tests. */
export function fixtureQuality(revision: Revision): RevisionQuality {
  return {
    versionId: revision.versionId,
    revisionId: revision.id,
    manifestSha256: revision.manifestSha256,
    entryFile: revision.entryFile,
    summary: {
      files: 60,
      scannedDocuments: 3,
      scannedBytes: 1024,
      checkedReferences: 55,
      errors: 51,
      warnings: 1,
      findingsTotal: 52,
      omittedFindings: 0,
      skippedDocuments: 0,
      uncheckedReferences: { external: 1, rootAbsolute: 2, fragment: 3, unsupportedScheme: 4 },
    },
    limits: {
      maxTextBytes: 2097152,
      maxTotalTextBytes: 33554432,
      maxReferences: 100000,
      maxFindings: 1000,
    },
    complete: true,
    findings: [
      {
        code: 'chinese_path',
        severity: 'warning',
        sourcePath: '页面/首页.html',
        targetPath: null,
        reference: null,
      },
      ...Array.from({ length: 51 }, (_, index) => ({
        code: 'missing_resource' as const,
        severity: 'error' as const,
        sourcePath: 'index.html',
        targetPath: `images/missing-${index}.png`,
        reference: `images/missing-${index}.png`,
      })),
    ],
  }
}
