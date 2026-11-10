import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/shared/api/client'
import { revisionMaterialsApi as api } from '@/modules/protohub-manager-ui/api/revision-material'
import { versionsApi } from '@/modules/protohub-manager-ui/api/version'
import {
  validMaterialFile,
  validSourceUrl,
} from '@/modules/protohub-manager-ui/utils/material-source'
vi.mock('@/shared/api/client', () => ({
  request: { post: vi.fn(), put: vi.fn(), getStream: vi.fn() },
}))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(request.post).mockResolvedValue({ success: true, status: 200, result: {} })
  vi.mocked(request.put).mockResolvedValue({ success: true, status: 200, result: {} })
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
