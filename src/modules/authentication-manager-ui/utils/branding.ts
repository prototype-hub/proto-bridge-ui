import { t } from '@/shared/i18n'
import { imageAllowed } from '@/modules/authentication-manager-ui/views/basis/utils/image'
import { isRecord } from '@/modules/authentication-manager-ui/utils/model'

/** Validate the value we send, without URL's host correction or changing the user's address. */
export function validBasePath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 2048 ||
    /[\p{White_Space}\p{Cc}]/u.test(value) ||
    /[\\?#{}|^`"<>]/.test(value) ||
    /%(?![\da-f]{2})/i.test(value)
  )
    return false
  if (value.startsWith('/')) return !value.startsWith('//') && !/[[\]]/.test(value)
  const absolute = /^https?:\/\/([^/]+)(\/.*)?$/.exec(value)
  if (!absolute || /[[\]]/.test(absolute[2] || '')) return false
  const authority = /^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(absolute[1]!)
  if (!authority) return false
  const host = authority[1]!
  if (!host.startsWith('[')) {
    if (/^[\d.]+$/.test(host)) {
      const octets = host.split('.')
      if (
        octets.length !== 4 ||
        octets.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)
      )
        return false
    } else {
      const labels = host.replace(/\.$/, '').split('.')
      if (
        !labels.every((label) => /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label)) ||
        (labels.length > 1 && !/^[a-z]/i.test(labels.at(-1)!))
      )
        return false
    }
  }
  try {
    const parsed = new URL(value)
    return (
      !parsed.username &&
      !parsed.password &&
      !!parsed.hostname &&
      (host.startsWith('[') || parsed.hostname.toLowerCase() === host.toLowerCase())
    )
  } catch {
    return false
  }
}
export function assertBasePath(value: unknown): asserts value is string {
  if (!validBasePath(value)) throw new Error(t('configuration.invalidBasePath'))
}

/** Check the original ICO bytes; neither its MIME nor its filename is rewritten for upload. */
export async function validateBrandingFile(file: File, kind: 'logo' | 'ico' | 'background') {
  imageAllowed(file, kind)
  if (kind !== 'ico') return
  if (!/\.ico$/i.test(file.name) || file.size <= 6) throw new Error(t('configuration.invalidIcon'))
  const header = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(reader.result)
        : reject(new Error(t('configuration.unreadableImage')))
    reader.onerror = () => reject(new Error(t('configuration.unreadableImage')))
    reader.onabort = () => reject(new Error(t('configuration.unreadableImage')))
    reader.readAsArrayBuffer(file.slice(0, 4))
  })
  const bytes = new Uint8Array(header)
  if (bytes.length !== 4 || bytes.some((byte, index) => byte !== [0, 0, 1, 0][index]))
    throw new Error(t('configuration.invalidIcon'))
}

export function uploadedBrandingUrl(result: unknown): string {
  if (isRecord(result)) {
    for (const value of [result.accessUrl, result.url]) {
      if (typeof value !== 'string' || !value || /[\s\\]/.test(value)) continue
      if (value.startsWith('/') && !value.startsWith('//') && !/[\s\\]/.test(value)) return value
      try {
        const url = new URL(value)
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password)
          return value
      } catch {
        // Try the alternate URL before reporting the malformed upload response.
      }
    }
  }
  throw new Error(t('configuration.invalidUploadResponse'))
}
