import { expect, it, vi } from 'vitest'
import {
  uploadedBrandingUrl,
  validBasePath,
  validateBrandingFile,
} from '@/modules/authentication-manager-ui/utils/branding'

vi.mock('@/shared/i18n', () => ({ t: (key: string) => key }))
it('allows the backend relative-path contract and ordinary HTTP hosts without rewriting values', () => {
  for (const value of [
    '/api',
    '/tools/api/',
    '/api/files%20path',
    '/api/中文文件',
    'http://localhost:5173/api',
    'http://192.168.0.28:5173/api',
    'https://example.com/api',
    'http://[::1]:5173/api',
  ])
    expect(validBasePath(value), value).toBe(true)
})
it('rejects malformed raw URI inputs instead of accepting browser host corrections', () => {
  for (const value of [
    '',
    'http://192.168.0.280:5173/api',
    'http://127.1/api',
    'http://2130706433/api',
    'http://0x7f000001/api',
    'http://host_name/api',
    'http://foo.1a/api',
    '/api\u00a0files',
    '/api\u0085files',
    'http://例子.测试/api',
    'http://user:password@example.com/api',
    'https://example.com/api?',
    '/api#',
    '/api?name=x',
    '//example.com/api',
    'ftp://example.com/api',
    'HTTP://example.com/api',
    'http://example.com\\api',
    '/api path',
    '/api%GG',
    `/${'a'.repeat(2048)}`,
  ])
    expect(validBasePath(value), value).toBe(false)
})
it('validates ICO filename and actual bytes with both browser MIME names and no MIME', async () => {
  for (const type of ['image/x-icon', 'image/vnd.microsoft.icon', '']) {
    await expect(
      validateBrandingFile(
        new File([new Uint8Array([0, 0, 1, 0, 1, 0, 0])], 'favicon.ICO', { type }),
        'ico',
      ),
    ).resolves.toBeUndefined()
  }
  for (const file of [
    new File(['not-an-icon'], 'favicon.ico', { type: 'image/x-icon' }),
    new File([new Uint8Array([0, 0, 1, 0, 1, 0, 0])], 'favicon.png', { type: 'image/x-icon' }),
    new File([new Uint8Array([0, 0, 1, 0, 1, 0])], 'favicon.ico', { type: 'image/x-icon' }),
  ])
    await expect(validateBrandingFile(file, 'ico')).rejects.toThrow('configuration.invalidIcon')
  await expect(
    validateBrandingFile(new File([new Uint8Array(1024 * 1024)], 'large.ico'), 'ico'),
  ).rejects.toThrow('configuration.oversizedImage')
})
it('accepts usable upload URLs and refuses malformed responses that would clear the preview', () => {
  expect(
    uploadedBrandingUrl({ accessUrl: 'https://example.com/api/icon.ico', url: '/api/icon.ico' }),
  ).toBe('https://example.com/api/icon.ico')
  expect(uploadedBrandingUrl({ url: '/api/icon.ico' })).toBe('/api/icon.ico')
  for (const result of [
    {},
    { accessUrl: '' },
    { accessUrl: 3 },
    { url: 'javascript:alert(1)' },
    { url: '//example.com/icon.ico' },
    null,
  ])
    expect(() => uploadedBrandingUrl(result)).toThrow('configuration.invalidUploadResponse')
})
