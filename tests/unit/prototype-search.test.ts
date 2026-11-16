import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/shared/api/client'
import { prototypeSearchApi } from '@/modules/protohub-manager-ui/api/search'
import {
  searchScope,
  searchSourceLocation,
  searchTool,
  searchHighlights,
} from '@/modules/protohub-manager-ui/utils/search'
import type { PrototypeSearchResult } from '@/modules/protohub-manager-ui/types/search'
vi.mock('@/shared/api/client', () => ({ request: { post: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
})
it('keeps the keyword in the POST body and propagates cancellation without using URL parameters', async () => {
  vi.mocked(request.post).mockResolvedValue({
    result: { data: [], total: 0, pageIndex: 0, pageSize: 20 },
    status: 200,
    success: true,
  })
  const signal = new AbortController().signal
  await prototypeSearchApi.query(
    { type: 'COPY', keyword: 'private <text>', projectId: 'p1', pageIndex: 2, pageSize: 10 },
    { signal, silent: true },
  )
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/search/_query',
    { type: 'COPY', keyword: 'private <text>', projectId: 'p1', pageIndex: 2, pageSize: 10 },
    { signal, silent: true },
  )
})
it('accepts only frozen scope ID syntax and rejects multi-valued, empty, or overlong IDs', () => {
  expect(
    searchScope({
      projectId: 'p_1',
      versionId: 'v-1',
      revisionId: 'a'.repeat(64),
      keyword: 'ignored',
    }),
  ).toEqual({ projectId: 'p_1', versionId: 'v-1', revisionId: 'a'.repeat(64) })
  for (const value of ['', ' p1', 'p/1', ['p1'], null, 'a'.repeat(65)])
    expect(searchScope({ projectId: value })).toBeNull()
  expect(searchScope({})).toEqual({})
})
it('builds fixed source URLs without leaking source snippets or keywords', () => {
  const row = {
    projectId: 'p1',
    versionId: 'v1',
    revisionId: 'r1',
    pageId: 'home',
    threadId: 'thread',
    snippet: 'private',
  } as PrototypeSearchResult
  expect(searchSourceLocation({ ...row, type: 'COPY' }).query).toEqual({
    revisionId: 'r1',
    pageId: 'home',
    tool: 'copy',
  })
  expect(searchSourceLocation({ ...row, type: 'MATERIAL' }).query).toEqual({
    revisionId: 'r1',
    tool: 'materials',
  })
  expect(searchSourceLocation({ ...row, type: 'FEEDBACK' }).query).toEqual({
    revisionId: 'r1',
    pageId: 'home',
    threadId: 'thread',
  })
})
it('never lets a tool marker replace thread targeting or an unspecified revision/page', () => {
  expect(searchTool({})).toBeUndefined()
  expect(searchTool({ tool: 'copy', revisionId: 'r1', pageId: 'home' })).toBe('copy')
  expect(searchTool({ tool: 'materials', revisionId: 'r1' })).toBe('materials')
  for (const query of [
    { tool: 'copy', revisionId: 'r1' },
    { tool: 'materials' },
    { tool: ['copy'], revisionId: 'r1', pageId: 'home' },
    { tool: 'copy', revisionId: 'r1', pageId: 'home', threadId: 'thread' },
    { tool: 'copy', revisionId: 'r1', pageId: 'p/1' },
  ])
    expect(searchTool(query)).toBeNull()
})
it('highlights literal text using original Unicode positions, never HTML or regex syntax', () => {
  expect(searchHighlights('İ edge EDGE', 'edge')).toEqual([
    { text: 'İ ', match: false },
    { text: 'edge', match: true },
    { text: ' ', match: false },
    { text: 'EDGE', match: true },
  ])
  expect(searchHighlights('<script>x</script> [a]+', '[a]+')).toEqual([
    { text: '<script>x</script> ', match: false },
    { text: '[a]+', match: true },
  ])
  expect(searchHighlights('😀文案😀', '😀')).toEqual([
    { text: '😀', match: true },
    { text: '文案', match: false },
    { text: '😀', match: true },
  ])
})
