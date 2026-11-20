import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/shared/api/client'
import { revisionMaterialsApi as api } from '@/modules/protohub-manager-ui/api/revision-material'
import { versionsApi } from '@/modules/protohub-manager-ui/api/version'
import {
  validMaterialFile,
  validLinkUrl,
  validSourceUrl,
} from '@/modules/protohub-manager-ui/utils/material-source'
vi.mock('@/shared/api/client', () => ({
  request: { post: vi.fn(), put: vi.fn(), get: vi.fn(), getStream: vi.fn() },
}))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(request.post).mockResolvedValue({ success: true, status: 200, result: {} })
  vi.mocked(request.put).mockResolvedValue({ success: true, status: 200, result: {} })
  vi.mocked(request.get).mockResolvedValue({ success: true, status: 200, result: {} })
})
it('extends existing package multipart optionally while preserving legacy call positions', async () => {
  const file = new File(['zip'], 'prototype.zip')
  await versionsApi.upload(
    'p /',
    'V1',
    'description',
    file,
    { silent: true },
    { sourceTool: ' Axure ', sourceUrl: 'https://example.com/source' },
  )
  const [url, body, options] = vi.mocked(request.post).mock.calls[0]!
  expect(url).toBe('/prototype-hub/projects/p%20%2F/versions')
  expect((body as FormData).get('sourceTool')).toBe('Axure')
  expect((body as FormData).get('file')).toBe(file)
  expect(options?.silent).toBe(true)
  await versionsApi.update('v1', 'V2', '', file, 'r1', { silent: true })
  expect((vi.mocked(request.put).mock.calls[0]![1] as FormData).get('sourceTool')).toBeNull()
})
it('escapes all path IDs and sends material bytes with an exact idempotency key', async () => {
  await api.upload('v/', 'r/穗', new File(['png'], '图.png'), { sourceName: 'design' }, 'same-key')
  expect(vi.mocked(request.post).mock.calls[0]![0]).toBe(
    '/prototype-hub/versions/v%2F/revisions/r%2F%E7%A9%97/materials',
  )
  expect(vi.mocked(request.post).mock.calls[0]![2]?.headers).toEqual({
    'Idempotency-Key': 'same-key',
  })
})
it('bounds accepted file categories and rejects unsafe external URL syntax', () => {
  expect(validMaterialFile(new File(['x'], 'design.PNG'))).toBe(true)
  expect(validMaterialFile(new File(['x'], 'spec.docx'))).toBe(true)
  expect(validMaterialFile(new File(['x'], 'image.svg'))).toBe(false)
  expect(validSourceUrl('https://example.com/source')).toBe(true)
  expect(validSourceUrl('javascript:alert(1)')).toBe(false)
  expect(validSourceUrl('https://user@example.com')).toBe(false)
  expect(validSourceUrl('https://example.com/\nsource')).toBe(false)
})
it('keeps metadata/text reads and bodyless extraction in the fixed, escaped material scope', async () => {
  const options = { signal: new AbortController().signal, silent: true }
  await api.get('v/', 'r/', 'm/', options)
  await api.text('v/', 'r/', 'm/', options)
  await api.extractText('v/', 'r/', 'm/', options)
  const root = '/prototype-hub/versions/v%2F/revisions/r%2F/materials/m%2F'
  expect(request.get).toHaveBeenNthCalledWith(1, root, undefined, options)
  expect(request.get).toHaveBeenNthCalledWith(2, `${root}/text`, undefined, options)
  expect(request.post).toHaveBeenCalledWith(`${root}/text/_extract`, undefined, {
    ...options,
    timeout: 120000,
  })
  await api.upload('v/', 'r/', new File(['txt'], 'guide.txt'), {}, 'same-key', options)
  expect(vi.mocked(request.post).mock.calls.at(-1)?.[2]).toMatchObject({
    ...options,
    timeout: 120000,
    headers: { 'Idempotency-Key': 'same-key' },
  })
})
it('creates standalone links in the fixed revision without a file or multipart payload', async () => {
  const source = { sourceName: 'PRD', sourceUrl: 'https://example.com/prd', sourceNotes: 'v2' }
  const options = { signal: new AbortController().signal, silent: true }
  await api.link('v/', 'r/', source, 'link-key', options)
  expect(request.post).toHaveBeenCalledWith(
    '/prototype-hub/versions/v%2F/revisions/r%2F/materials/links',
    { ...source, clientRequestId: 'link-key' },
    options,
  )
})
it.each([
  'https:example.com',
  'https://@example.com',
  'https://example.com:0/path',
  'https://example.com:',
  'https://example.com:65536/path',
  'https://example.com/a b',
  'https://example.com/a\u00a0b',
  'https://example.com\\path',
])('rejects URL syntax normalized unsafely by the browser: %s', (value) => {
  expect(validLinkUrl(value)).toBe(false)
})
it('reads one PDF preview with server page and pixel metadata', async () => {
  const blob = new Blob(['png'])
  vi.mocked(request.getStream).mockResolvedValue({
    blob,
    contentType: 'image/png',
    filename: 'preview.png',
    headers: {
      'x-preview-page': '1',
      'x-preview-pages': '3',
      'x-preview-width': '800',
      'x-preview-height': '1200',
    },
  })
  const options = { signal: new AbortController().signal, silent: true }
  await expect(api.preview('v/', 'r/', 'm/', 1, options)).resolves.toEqual({
    blob,
    page: 1,
    pages: 3,
    width: 800,
    height: 1200,
  })
  expect(request.getStream).toHaveBeenCalledWith(
    '/prototype-hub/versions/v%2F/revisions/r%2F/materials/m%2F/preview',
    { page: 1 },
    { ...options, timeout: 45000 },
  )
})
it.each([
  {},
  { 'x-preview-page': '2' },
  { 'x-preview-pages': '101' },
  { 'x-preview-width': '4097' },
  { 'x-preview-width': '4000', 'x-preview-height': '4000' },
  { 'x-preview-height': 'NaN' },
])('rejects missing, mismatched or over-budget preview metadata: %j', async (headers) => {
  vi.mocked(request.getStream).mockResolvedValue({
    blob: new Blob(['png']),
    contentType: 'image/png',
    filename: 'preview.png',
    headers: Object.keys(headers).length
      ? {
          'x-preview-page': '0',
          'x-preview-pages': '2',
          'x-preview-width': '800',
          'x-preview-height': '1000',
          ...headers,
        }
      : {},
  })
  await expect(api.preview('v1', 'r1', 'm1', 0)).rejects.toThrow()
})
