import { t } from '@/shared/i18n'
export function safeExternalUrl(value: string): string {
  const url = new URL(value, window.location.origin)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error(t('common.invalid'))
  return url.href
}
