import { storage } from '@/shared/storage'
import { config } from '@/shared/config'
export const token = {
  get: () => storage.get('token', [config.legacyTokenKey]),
  set: (value: string) => storage.set('token', value),
  clear: () => storage.remove('token', [config.legacyTokenKey]),
}
