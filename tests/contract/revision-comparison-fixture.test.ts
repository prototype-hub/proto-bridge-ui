import { expect, it } from 'vitest'
import { fixtureComparison } from '../fixtures/comparison'
import type { Revision } from '@/modules/protohub-manager-ui/types'
const revision = (id: string): Revision => ({
  id,
  projectId: 'p1',
  versionId: 'v1',
  versionName: id,
  entryFile: 'index.html',
  manifestSha256: 'a'.repeat(64),
  fileCount: 127,
  totalBytes: 100,
  createdAt: 1,
  createdBy: 'admin',
})
it('keeps complete counts before filtering and independently pages large known differences', () => {
  const pair = fixtureComparison(
    revision('compare-left'),
    revision('compare-right'),
    new URLSearchParams(),
  )
  expect(pair.summary).toEqual({
    pages: { added: 1, removed: 1, changed: 1, unchanged: 56 },
    files: { added: 1, removed: 1, changed: 2, unchanged: 124 },
  })
  expect(pair.pages.total).toBe(3)
  expect(pair.files.total).toBe(4)
  expect(pair.pages.data.find((row) => row.path === 'old.html')?.right).toBeNull()
  const all = fixtureComparison(
    pair.left,
    pair.right,
    new URLSearchParams({
      includeUnchanged: 'true',
      pagesPageIndex: '1',
      filesPageIndex: '2',
      filesPageSize: '50',
    }),
  )
  expect(all.summary).toEqual(pair.summary)
  expect(all.pages.total).toBe(59)
  expect(all.pages.data).toHaveLength(9)
  expect(all.files.total).toBe(128)
  expect(all.files.data).toHaveLength(28)
  expect(all.files.data.map((row) => row.path)).toEqual(
    all.files.data.map((row) => row.path).sort(),
  )
})
