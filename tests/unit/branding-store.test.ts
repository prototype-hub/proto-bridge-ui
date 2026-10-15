import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBranding } from '@/app/stores/branding'
import { publicRequest } from '@/shared/api/public-client'
import { defaultBrandingImages } from '@/modules/authentication-manager-ui'

vi.mock('@/shared/api/public-client', () => ({ publicRequest: { get: vi.fn() } }))

let originalIcons: HTMLLinkElement[] = []
let originalTitle = ''
beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(publicRequest.get).mockReset()
  originalTitle = document.title
  originalIcons = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')]
  originalIcons.forEach((icon) => icon.remove())
})
afterEach(() => {
  document.head.querySelectorAll('link[rel="icon"]').forEach((icon) => icon.remove())
  originalIcons.forEach((icon) => document.head.append(icon))
  document.title = originalTitle
})

it('restores the saved favicon on app load when the document has no icon link', async () => {
  vi.mocked(publicRequest.get).mockResolvedValue({
    success: true,
    status: 200,
    result: { title: 'Configured title', ico: '/api/saved.ico' },
  })
  const branding = useBranding()
  await branding.load()
  expect(publicRequest.get).toHaveBeenCalledWith('/system/config/front', undefined, {
    silent: true,
  })
  expect(document.title).toBe('Configured title')
  expect(branding.front.ico).toBe('/api/saved.ico')
  const icons = document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
  expect(icons).toHaveLength(1)
  expect(icons[0]?.getAttribute('href')).toBe('/api/saved.ico')
})

it('reuses the document favicon and restores the module default when its custom value is cleared', () => {
  const existing = document.createElement('link')
  existing.rel = 'icon'
  existing.href = '/old.ico'
  document.head.append(existing)
  const branding = useBranding()
  expect(existing.getAttribute('href')).toBe(defaultBrandingImages.ico)
  branding.apply({ ico: '/new.ico' })
  branding.apply({ ico: '/latest.ico' })
  expect(document.head.querySelectorAll('link[rel="icon"]')).toHaveLength(1)
  expect(document.head.querySelector('link[rel="icon"]')).toBe(existing)
  expect(existing.getAttribute('href')).toBe('/latest.ico')
  branding.apply({ ico: '' })
  expect(existing.getAttribute('href')).toBe(defaultBrandingImages.ico)
  expect(document.head.querySelectorAll('link[rel="icon"]')).toHaveLength(1)
})

it('shows all module images immediately without writing defaults into persisted values', () => {
  const branding = useBranding()
  expect(branding.images).toEqual(defaultBrandingImages)
  expect(branding.front).toEqual({})
  expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe(
    defaultBrandingImages.ico,
  )
})

it('resolves defaults independently and preserves custom image paths verbatim', () => {
  const branding = useBranding()
  const value = { logo: 'https://images.example/custom logo.png', ico: '', background: '   ' }
  branding.apply(value)
  expect(branding.images).toEqual({ ...defaultBrandingImages, logo: value.logo })
  expect(branding.front).toEqual(value)
  const custom = { logo: '/api/logo.png', ico: '/api/logo.ico', background: '/api/background.png' }
  branding.apply(custom)
  expect(branding.images).toEqual(custom)
})

it('keeps defaults on missing configuration or a failed public branding load', async () => {
  const branding = useBranding()
  vi.mocked(publicRequest.get).mockResolvedValue({
    success: true,
    status: 200,
    result: { logo: '', ico: null },
  })
  await branding.load()
  expect(branding.images).toEqual(defaultBrandingImages)
  vi.mocked(publicRequest.get).mockRejectedValue(new Error('Unavailable'))
  await branding.load()
  expect(branding.images).toEqual(defaultBrandingImages)
  expect(branding.front).toEqual({})
})
