import { expect, it } from 'vitest'
import {
  previewIdentity,
  resolvePreviewPage,
  stablePageId,
  reviewThreadTarget,
} from '@/modules/protohub-manager-ui/utils/preview-location'
import {
  filterPageNodes,
  pageAncestorKeys,
  pageNodes,
} from '@/modules/protohub-manager-ui/utils/pages'
import type { PrototypePage } from '@/modules/protohub-manager-ui/types'
const base = '/api/prototype-hub/runtime/v1/key'
const threadId = 'a'.repeat(43)
it('requires the complete single-valued thread triple while leaving ordinary page links compatible', () => {
  expect(reviewThreadTarget({ revisionId: 'r1' })).toBeUndefined()
  expect(reviewThreadTarget({ revisionId: 'r1', pageId: 'page', threadId })).toEqual({
    revisionId: 'r1',
    pageId: 'page',
    threadId,
  })
})
it.each([
  { threadId },
  { revisionId: 'r1', threadId },
  { pageId: 'page', threadId },
  { revisionId: '', pageId: 'page', threadId },
  { revisionId: ['r1', 'r1'], pageId: 'page', threadId },
  { revisionId: 'r1', pageId: ['page'], threadId },
  { revisionId: 'r1', pageId: ' page', threadId },
  ...[
    '',
    ' ',
    null,
    [threadId],
    [threadId, threadId],
    'a'.repeat(42),
    'a'.repeat(44),
    `${'a'.repeat(42)}/`,
    `${'a'.repeat(43)}\n`,
  ].map((value) => ({ revisionId: 'r1', pageId: 'page', threadId: value })),
])('rejects an invalid/partial thread target without guessing scope %j', (query) => {
  expect(reviewThreadTarget(query)).toBeNull()
})
const pages: PrototypePage[] = [
  {
    name: 'Group',
    folder: true,
    pageId: 'folder',
    children: [
      { name: 'Home', path: 'index.html', pageId: 'home' },
      { name: '详情', path: 'nested/detail%#?.html', pageId: 'detail' },
      { name: 'Legacy', path: 'legacy.html' },
      { name: 'Duplicate A', path: 'a.html', pageId: 'duplicate' },
      { name: 'Duplicate B', path: 'b.html', pageId: 'duplicate' },
      { name: 'Unsafe', path: '../outside.html', pageId: 'unsafe' },
    ],
  },
]
it.each([
  '',
  ' ',
  '\n',
  ' x',
  'x ',
  'x\u007f',
  'x'.repeat(257),
  ['home'],
  ['home', 'detail'],
  null,
])('rejects malformed/duplicate route identity %j', (value) => {
  expect(previewIdentity(value)).toBeNull()
  expect(resolvePreviewPage(pages, base, value).invalid).toBe(true)
})
it.each(['missing', 'HOME', 'duplicate', 'folder', 'unsafe'])(
  'does not fall back for explicit target %s',
  (id) => {
    expect(resolvePreviewPage(pages, base, id)).toEqual({ invalid: true })
  },
)
it('uses exact safe manifest page and never fabricates legacy or duplicate IDs', () => {
  expect(resolvePreviewPage(pages, base, undefined)).toMatchObject({ page: { pageId: 'home' } })
  expect(resolvePreviewPage(pages, base, 'detail')).toMatchObject({
    page: { path: 'nested/detail%#?.html' },
  })
  expect(stablePageId(pages[0].children![2], pages)).toBeUndefined()
  expect(stablePageId(pages[0].children![3], pages)).toBeUndefined()
  expect(stablePageId(pages[0].children![1], pages)).toBe('detail')
  expect(
    resolvePreviewPage([{ name: 'Folder', pageId: 'home', folder: true }, ...pages], base, 'home')
      .invalid,
  ).toBe(true)
})
it('filters literal names/paths case-insensitively while retaining ancestors and the selected page', () => {
  const nodes = pageNodes(pages)
  expect(filterPageNodes(nodes, 'NESTED/DETAIL%#?')[0].children?.map((node) => node.title)).toEqual(
    ['详情'],
  )
  expect(filterPageNodes(nodes, '.*')).toEqual([])
  expect(
    filterPageNodes(nodes, 'HOME', 'legacy.html')[0].children?.map((node) => node.title),
  ).toEqual(['Home', 'Legacy'])
  expect(pageAncestorKeys(nodes, 'nested/detail%#?.html')).toEqual([nodes[0].key])
})
