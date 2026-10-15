import { config } from '@/shared/config'
export function createStorage(
  storage: Storage,
  namespace: string,
  legacyNamespaces: string[] = [],
) {
  const key = (name: string) => `${namespace}:${name}`
  return {
    get(name: string, legacyKeys: string[] = []): string | null {
      const current = storage.getItem(key(name))
      if (current !== null) return current
      for (const previous of [...legacyNamespaces.map((ns) => `${ns}:${name}`), ...legacyKeys]) {
        const value = storage.getItem(previous)
        if (value !== null) {
          storage.setItem(key(name), value)
          storage.removeItem(previous)
          return value
        }
      }
      return null
    },
    set(name: string, value: string) {
      storage.setItem(key(name), value)
    },
    remove(name: string, legacyKeys: string[] = []) {
      for (const entry of [
        key(name),
        ...legacyNamespaces.map((ns) => `${ns}:${name}`),
        ...legacyKeys,
      ])
        storage.removeItem(entry)
    },
  }
}
export const storage = createStorage(
  window.localStorage,
  config.storageNamespace,
  config.legacyNamespaces,
)

export const sessionStorageAdapter = createStorage(
  window.sessionStorage,
  config.storageNamespace,
  config.legacyNamespaces,
)
