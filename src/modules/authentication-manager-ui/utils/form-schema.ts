import { t } from '@/shared/i18n'
import { stringValue } from '@/modules/authentication-manager-ui/utils/model'
import type { Field } from '@/modules/authentication-manager-ui/types/forms'

export const field = (
  key: string,
  kind: Field['kind'] = 'text',
  required = false,
  extra: Partial<Field> = {},
): Field => ({ key, kind, required, label: `system.${key}`, ...extra })

export function validateLength(value: unknown, max: number) {
  if (stringValue(value).length > max) throw new Error(t('organization.maxLength', { max }))
}
