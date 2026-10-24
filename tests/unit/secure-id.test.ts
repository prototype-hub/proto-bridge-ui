import { afterEach, expect, it, vi } from 'vitest'
import { secureId } from '@/shared/utils/secure-id'
afterEach(() => vi.unstubAllGlobals())
it('uses the platform UUID when available', () => {
  const randomUUID = vi.fn(() => 'platform-id')
  vi.stubGlobal('crypto', { randomUUID })
  expect(secureId()).toBe('platform-id')
})
it('uses secure random bytes on LAN HTTP and preserves UUID version and variant', () => {
  let sequence = 0
  const getRandomValues = vi.fn((bytes: Uint8Array) => {
    bytes.fill(++sequence)
    return bytes
  })
  vi.stubGlobal('crypto', { getRandomValues })
  const first = secureId()
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(secureId()).not.toBe(first)
  expect(getRandomValues).toHaveBeenCalledTimes(2)
})
