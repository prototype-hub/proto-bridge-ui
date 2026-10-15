import { message } from 'ant-design-vue'
import { t } from '@/shared/i18n'
import { writeClipboard } from './clipboard'
export const saved = () => message.success(t('common.saved'))
export const deleted = () => message.success(t('common.deleted'))
// Only report success after one of the browser copy mechanisms has succeeded.
export async function copyText(text: string, context?: HTMLElement): Promise<boolean> {
  if (await writeClipboard(text, context)) {
    message.success(t('common.copied'))
    return true
  } else {
    message.error(t('common.copyFailed'))
    return false
  }
}
