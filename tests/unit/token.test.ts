import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { token } from '@/shared/auth/token'
import { config } from '@/shared/config'

const name = `${config.storageNamespace}-remember-token`
beforeEach(() => {
  token.clear()
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  token.clear()
})

describe('remembered token persistence', () => {
  it('keeps the ordinary login storage policy and removes old remembered credentials', () => {
    token.set('remembered', true)
    localStorage.setItem(config.legacyTokenKey, 'legacy')
    token.set('ordinary')
    expect(document.cookie).not.toContain(name)
    expect(token.getRemembered()).toBeNull()
    expect(localStorage.getItem(config.legacyTokenKey)).toBeNull()
    expect(localStorage.getItem(`${config.storageNamespace}:token`)).toBe('ordinary')
    expect(token.get()).toBe('ordinary')
  })

  it('stores only the encoded token in a host-only bounded cookie and renews it when read', () => {
    localStorage.setItem(`${config.storageNamespace}:token`, 'old-local')
    const write = vi.spyOn(Document.prototype, 'cookie', 'set')
    const value = 'backend.token+with/=special;characters'
    token.set(value, true)
    expect(localStorage.getItem(`${config.storageNamespace}:token`)).toBeNull()
    expect(document.cookie).toBe(`${name}=${encodeURIComponent(value)}`)
    expect(write).toHaveBeenLastCalledWith(
      `${name}=${encodeURIComponent(value)}; Max-Age=34560000; Path=/; SameSite=Lax`,
    )
    write.mockClear()
    expect(token.get()).toBe(value)
    expect(write).toHaveBeenCalledOnce()
    expect(write.mock.calls[0]?.[0]).not.toMatch(/Domain=|password/i)
  })

  it('sets Secure when HTTPS is used', () => {
    vi.stubGlobal('location', new URL('https://example.test/'))
    const write = vi.spyOn(Document.prototype, 'cookie', 'set')
    token.set('secure-token', true)
    expect(write).toHaveBeenLastCalledWith(
      `${name}=secure-token; Max-Age=34560000; Path=/; SameSite=Lax; Secure`,
    )
  })

  it('clears cookie and migrated credentials without falling back after a malformed cookie', () => {
    localStorage.setItem(`${config.storageNamespace}:token`, 'old-local')
    localStorage.setItem(config.legacyTokenKey, 'legacy')
    document.cookie = `${name}=%broken; Path=/`
    expect(token.get()).toBeNull()
    expect(document.cookie).not.toContain(name)
    expect(localStorage.getItem(`${config.storageNamespace}:token`)).toBeNull()
    expect(localStorage.getItem(config.legacyTokenKey)).toBeNull()
    document.cookie = `${config.legacyTokenKey}=legacy-cookie; Path=/`
    token.set('remembered', true)
    token.clear()
    expect(document.cookie).toBe('')
    expect(token.get()).toBeNull()
  })
})
