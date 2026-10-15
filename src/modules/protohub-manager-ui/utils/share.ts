import type { Share } from '@/modules/protohub-manager-ui/types'

export type ShareValidity = 'permanent' | 'temporary' | 'expired'

/** Produce plain text with a real newline; preserve the exact password characters. */
export function shareCopyContent(
  projectName: string,
  versionName: string,
  url: string,
  passwordLabel: string,
  password?: string,
): string {
  const link = `${projectName}-${versionName}：${url}`
  return password === undefined ? link : `${link}\n${passwordLabel}：${password}`
}

/** Match backend requireActive: disabled links and the exact expiry boundary are invalid. */
export function shareValidity(
  share: Pick<Share, 'enabled' | 'expiresAt'>,
  now: number,
): ShareValidity {
  if (share.enabled !== true || (share.expiresAt != null && share.expiresAt <= now))
    return 'expired'
  return share.expiresAt == null ? 'permanent' : 'temporary'
}
