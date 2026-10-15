import { t } from '@/shared/i18n'

export function imageAllowed(file: File, kind: 'logo' | 'ico' | 'background') {
  const valid =
    kind === 'ico'
      ? ['image/x-icon', 'image/vnd.microsoft.icon'].includes(file.type) ||
        /\.ico$/i.test(file.name)
      : /\.(jpg|png|jfif|pjp|pjpeg|jpeg)$/i.test(file.name) && file.type.startsWith('image/')
  if (!valid) throw new Error(t('configuration.invalidImage'))
  if (file.size >= (kind === 'ico' ? 1 : 4) * 1024 * 1024)
    throw new Error(t('configuration.oversizedImage'))
}
