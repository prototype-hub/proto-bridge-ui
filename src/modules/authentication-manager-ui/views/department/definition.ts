import type { Field } from '@/modules/authentication-manager-ui/types/forms'
import type { Model, SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import { stringValue } from '@/modules/authentication-manager-ui/utils/model'
import { t } from '@/shared/i18n'
import { field, validateLength } from '@/modules/authentication-manager-ui/utils/form-schema'
import { forbiddenParents } from '@/modules/authentication-manager-ui/utils/organization'

export const organizationFields: Field[] = [
  field('parentId', 'tree', false, { source: 'organizations', label: 'organization.parent' }),
  field('name', 'text', true, { max: 64 }),
  field('sortIndex', 'number', true),
]
export function validateOrganization(data: Model, rows: SystemRecord[]) {
  const order = Number(data.sortIndex)
  if (!Number.isInteger(order) || order < 1) throw new Error(t('organization.sortRequired'))
  if (data.id && forbiddenParents(rows, stringValue(data.id)).has(stringValue(data.parentId)))
    throw new Error(t('organization.invalidParent'))
  validateLength(data.name, 64)
}
