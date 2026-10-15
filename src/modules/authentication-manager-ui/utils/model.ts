import type { Model, SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import type { Field } from '@/modules/authentication-manager-ui/types/forms'
import { t } from '@/shared/i18n'
export const isRecord = (value: unknown): value is Model =>
  !!value && typeof value === 'object' && !Array.isArray(value)
export function resultOf(value: unknown): unknown {
  return isRecord(value) && 'result' in value ? value.result : value
}
export function recordsOf(value: unknown): SystemRecord[] {
  const result = resultOf(value)
  const rows = Array.isArray(result)
    ? result
    : isRecord(result) && Array.isArray(result.data)
      ? result.data
      : []
  return rows.filter(isRecord).map((item) => ({
    ...item,
    id: String(
      item.id ?? item.assetId ?? item.value ?? item.providerId ?? item.owner ?? item.code ?? '',
    ),
    name: String(item.name ?? item.text ?? item.id ?? ''),
    children: Array.isArray(item.children) ? recordsOf(item.children) : undefined,
  }))
}
export function getValue(model: Model, key: string): unknown {
  let value: unknown = model
  for (const part of key.split('.')) value = isRecord(value) ? value[part] : undefined
  return value
}
export function setValue(model: Model, key: string, value: unknown) {
  const parts = key.split('.')
  let target = model
  for (const part of parts.slice(0, -1)) {
    if (!isRecord(target[part])) target[part] = {}
    target = target[part] as Model
  }
  target[parts.at(-1)!] = value
}
export function stringValue(value: unknown) {
  return value === undefined || value === null ? '' : String(value)
}
export function numberValue(value: unknown) {
  return typeof value === 'number' ? value : undefined
}
export function arrayValue(value: unknown): (string | number)[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string | number => typeof item === 'string' || typeof item === 'number',
      )
    : []
}
export function jsonValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)
}
export function visibleField(field: Field, model: Model) {
  return [...(field.conditions || []), ...(field.when ? [field.when] : [])].every((condition) => {
    const value = getValue(model, condition.key)
    return Array.isArray(value)
      ? condition.values.some((item) => value.includes(item))
      : condition.values.includes(value as string | boolean)
  })
}
export function prepareModel(model: Model, fields: Field[]): Model {
  const output = structuredClone(JSON.parse(JSON.stringify(model)) as Model)
  for (const field of fields.filter((field) => visibleField(field, model))) {
    if (field.kind === 'json' && typeof getValue(output, field.key) === 'string') {
      try {
        setValue(output, field.key, JSON.parse(String(getValue(output, field.key))) as unknown)
      } catch {
        throw new Error(`${t('common.invalid')}: ${t(field.label)}`)
      }
    }
  }
  return output
}
export function flatten(rows: SystemRecord[]): SystemRecord[] {
  return rows.flatMap((row) => [row, ...flatten(row.children || [])])
}
export function displayValue(value: unknown): string {
  if (Array.isArray(value))
    return value
      .map((item) => (isRecord(item) ? stringValue(item.name || item.id) : stringValue(item)))
      .join(', ')
  if (isRecord(value))
    return stringValue(value.text || value.name || value.value) || JSON.stringify(value)
  return stringValue(value)
}
