import { storage } from '@/shared/storage'
import { config } from '@/shared/config'

// Browsers bound persistent cookies. Renew this finite window while the remembered token is used.
const rememberMaxAge = 400 * 24 * 60 * 60
const cookieName = (namespace: string) => `${encodeURIComponent(namespace)}-remember-token`
const attributes = () =>
  `; Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`

function clear() {
  storage.remove('token', [config.legacyTokenKey])
  const names = new Set([
    ...[config.storageNamespace, ...config.legacyNamespaces].map(cookieName),
    encodeURIComponent(config.legacyTokenKey),
  ])
  for (const name of names) document.cookie = `${name}=; Max-Age=0${attributes()}`
}

function remember(value: string) {
  document.cookie = `${cookieName(config.storageNamespace)}=${encodeURIComponent(value)}; Max-Age=${rememberMaxAge}${attributes()}`
}

function getRemembered(): string | null {
  const prefix = `${cookieName(config.storageNamespace)}=`
  const entry = document.cookie.split(';').find((part) => part.trim().startsWith(prefix))
  if (!entry) return null
  try {
    const value = decodeURIComponent(entry.trim().slice(prefix.length))
    if (value) {
      remember(value)
      return value
    }
  } catch {
    // A malformed remembered credential must not fall back to an older local-storage token.
  }
  clear()
  return null
}

export const token = {
  get: () => getRemembered() ?? storage.get('token', [config.legacyTokenKey]),
  getRemembered,
  set(value: string, rememberMe = false) {
    clear()
    if (rememberMe) remember(value)
    else storage.set('token', value)
  },
  clear,
}
