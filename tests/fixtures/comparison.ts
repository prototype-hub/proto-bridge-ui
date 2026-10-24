import { createHash } from 'node:crypto'
import type {
  ComparisonFile,
  ComparisonPage,
  ComparisonStatus,
  PrototypePage,
  Revision,
  RevisionComparison,
} from '../../src/modules/protohub-manager-ui/types'

const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export const comparisonIds = ['compare-left', 'compare-right'] as const
export function comparisonPages(id: string): PrototypePage[] {
  const side = id === comparisonIds[0] ? 'left' : 'right'
  return [
    { name: side === 'left' ? 'Old home' : 'New home', path: 'index.html', pageId: `${side}-home` },
    {
      name: side === 'left' ? 'Removed page' : 'Added page',
      path: side === 'left' ? 'old.html' : 'new.html',
      pageId: `${side}-only`,
    },
    { name: 'Legacy page', path: 'legacy.html', pageId: null },
    ...Array.from({ length: 55 }, (_, index) => ({
      name: `Page ${index}`,
      path: `pages/${String(index).padStart(3, '0')}.html`,
      pageId: `${side}-${index}`,
    })),
  ]
}
function files(id: string) {
  const side = id === comparisonIds[0] ? 'left' : 'right'
  return new Map<string, NonNullable<ComparisonFile['left']>>([
    ...Array.from(
      { length: 69 },
      (_, index) =>
        [
          `files/${String(index).padStart(3, '0')}.txt`,
          { size: 10, sha256: digest(index === 2 ? side : String(index)), mediaType: 'text/plain' },
        ] as const,
    ),
    ...comparisonPages(id)
      .filter((page) => page.path === 'legacy.html' || page.path?.startsWith('pages/'))
      .map(
        (page) =>
          [page.path!, { size: 10, sha256: digest(page.path!), mediaType: 'text/html' }] as const,
      ),
    ['index.html', { size: 20, sha256: digest(side), mediaType: 'text/html' }] as const,
    [
      side === 'left' ? 'old.html' : 'new.html',
      { size: 12, sha256: digest(side), mediaType: 'text/html' },
    ] as const,
  ])
}
function counts(rows: { status: ComparisonStatus }[]) {
  const result = { added: 0, removed: 0, changed: 0, unchanged: 0 }
  for (const row of rows) result[row.status]++
  return result
}
/** Deterministic, large two-revision fixture; production classification is exercised by the backend. */
export function fixtureComparison(
  left: Revision,
  right: Revision,
  query: URLSearchParams,
): RevisionComparison {
  const lp = new Map(comparisonPages(left.id).map((page) => [page.path!, page]))
  const rp = new Map(comparisonPages(right.id).map((page) => [page.path!, page]))
  const lf = files(left.id),
    rf = files(right.id)
  const paths = <T>(a: Map<string, T>, b: Map<string, T>) =>
    [...new Set([...a.keys(), ...b.keys()])].sort()
  const fileRows: ComparisonFile[] = paths(lf, rf).map((path) => {
    const l = lf.get(path),
      r = rf.get(path)
    return {
      path,
      left: l || null,
      right: r || null,
      status: !l
        ? 'added'
        : !r
          ? 'removed'
          : l.sha256 !== r.sha256 || l.size !== r.size
            ? 'changed'
            : 'unchanged',
    }
  })
  const pageRows: ComparisonPage[] = paths(lp, rp).map((path) => {
    const l = lp.get(path),
      r = rp.get(path)
    const side = (page: PrototypePage | undefined) =>
      page ? { path, name: page.name, pageId: page.pageId || null } : null
    return {
      path,
      left: side(l),
      right: side(r),
      status: !l
        ? 'added'
        : !r
          ? 'removed'
          : l.name !== r.name || fileRows.find((row) => row.path === path)?.status === 'changed'
            ? 'changed'
            : 'unchanged',
    }
  })
  function pager<T extends { status: ComparisonStatus }>(kind: 'pages' | 'files', rows: T[]) {
    const pageIndex = Number(query.get(`${kind}PageIndex`) || 0),
      pageSize = Number(query.get(`${kind}PageSize`) || 50)
    const filtered = rows.filter(
      (row) => query.get('includeUnchanged') === 'true' || row.status !== 'unchanged',
    )
    return {
      data: filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      total: filtered.length,
      pageIndex,
      pageSize,
    }
  }
  return {
    versionId: left.versionId,
    left,
    right,
    summary: { pages: counts(pageRows), files: counts(fileRows) },
    pages: pager('pages', pageRows),
    files: pager('files', fileRows),
  }
}
