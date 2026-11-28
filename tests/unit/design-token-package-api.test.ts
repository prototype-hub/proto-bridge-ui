import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/shared/api/client'
import { designTokenPackagesApi as api } from '@/modules/protohub-manager-ui/api/design-token-package'
import {
  filterDesignTokens,
  validDesignTokenFile,
} from '@/modules/protohub-manager-ui/utils/design-token-package'
import { tokenDocument } from '../fixtures/design-token-package'
vi.mock('@/shared/api/client', () => ({
  request: { get: vi.fn(), post: vi.fn(), put: vi.fn(), getStream: vi.fn() },
}))
const target = { versionId: 'v/', revisionId: 'r/穗' }
const root = '/prototype-hub/versions/v%2F/revisions/r%2F%E7%A9%97/design-token-packages'
beforeEach(() => {
  vi.resetAllMocks()
  for (const method of [request.post, request.put, request.get])
    vi.mocked(method).mockResolvedValue({ success: true, status: 200, result: {} })
})
it('sends the original File with independent authoritative preview and exact multipart import', async () => {
  const file = new File(['\ufeff { "a": 1 }\n'], '原始.json', { type: 'application/json' })
  await api.validate(target, file)
  await api.import(
    target,
    file,
    { sourceName: ' Design ', sourceUrl: 'https://example.com/source' },
    true,
    'same-key',
    { silent: true },
  )
  const [validateUrl, validation] = vi.mocked(request.post).mock.calls[0]!
  expect(validateUrl).toBe(`${root}/_validate`)
  expect([...(validation as FormData).keys()]).toEqual(['file'])
  const [url, body, options] = vi.mocked(request.post).mock.calls[1]!
  expect(url).toBe(`${root}/_import`)
  expect((body as FormData).get('file')).toBe(file)
  expect((body as FormData).get('allowInvalid')).toBe('true')
  expect((body as FormData).get('sourceName')).toBe('Design')
  expect(options).toMatchObject({ silent: true, headers: { 'Idempotency-Key': 'same-key' } })
})
it('keeps all eight operations on the exact escaped revision and distinguishes omitted from explicit inputs', async () => {
  const mutation = { expectedVersion: 7, clientRequestId: 'request' }
  await api.query(target, { pageIndex: 2, pageSize: 20 })
  await api.get(target, 'p/')
  await api.document(target, 'p/')
  const inputs = Object.fromEntries([
    ['__proto__', 'night'],
    ['density', 'compact'],
  ])
  await api.document(target, 'p/', inputs)
  await api.content(target, 'p/')
  await api.update(target, 'p/', { sourceNotes: null }, mutation)
  await api.remove(target, 'p/', mutation)
  expect(request.post).toHaveBeenCalledWith(
    `${root}/_query`,
    { pageIndex: 2, pageSize: 20 },
    undefined,
  )
  expect(request.get).toHaveBeenCalledWith(`${root}/p%2F`, undefined, undefined)
  expect(request.post).toHaveBeenCalledWith(`${root}/p%2F/_document`, {}, { timeout: 120000 })
  expect(request.post).toHaveBeenCalledWith(
    `${root}/p%2F/_document`,
    { inputs },
    { timeout: 120000 },
  )
  expect(request.getStream).toHaveBeenCalledWith(`${root}/p%2F/content`, undefined, undefined)
  expect(request.put).toHaveBeenCalledWith(
    `${root}/p%2F`,
    { sourceNotes: null, ...mutation },
    undefined,
  )
  expect(request.post).toHaveBeenCalledWith(`${root}/p%2F/_delete`, mutation, undefined)
  expect(Object.getPrototypeOf(inputs)).toBe(Object.prototype)
  expect(Object.hasOwn(inputs, '__proto__')).toBe(true)
})
it('does only filename/size checks locally and searches the complete document before result pagination', () => {
  expect(validDesignTokenFile(new File(['this is not JSON'], 'tokens.json'))).toBe(true)
  expect(validDesignTokenFile(new File(['{}'], 'tokens.html'))).toBe(false)
  expect(validDesignTokenFile(new File([new Uint8Array(1048577)], 'tokens.json'))).toBe(false)
  const doc = tokenDocument()
  const query = { keyword: 'token29', group: '', set: '', type: '*' }
  expect(filterDesignTokens(doc, query).map((token) => token.name)).toEqual(['token29'])
  expect(
    filterDesignTokens(doc, { ...query, keyword: '', set: 'base' }).map((token) => token.name),
  ).toEqual(['token29'])
  expect(
    filterDesignTokens(doc, {
      ...query,
      keyword: 'color/token29',
      group: '["color"]',
      type: 'number',
    }),
  ).toHaveLength(1)
  expect(
    filterDesignTokens(doc, { ...query, keyword: '', group: '["color","nested"]' }),
  ).toHaveLength(0)
})
