import type { Query, QueryTerm } from '@/shared/api/types'
import type { EntityDefinition } from '@/modules/authentication-manager-ui/types/dictionary'
import { resultOf, stringValue } from '@/modules/authentication-manager-ui/utils/model'
import { t } from '@/shared/i18n'
import { field, validateLength } from '@/modules/authentication-manager-ui/utils/form-schema'
import { scopedQueryTerms } from '@/modules/authentication-manager-ui/utils/query-scope'
import * as dictionary from '@/modules/authentication-manager-ui/api/dictionary/dictionary'

export function validateCode(value: unknown) {
  if (!/^[a-zA-Z0-9_-]+$/.test(stringValue(value))) throw new Error(t('organization.invalidCode'))
  validateLength(value, 64)
}
export const dictionaryDefinition: EntityDefinition = {
  key: 'dictionary',
  title: 'system.dictionary',
  permission: 'system/Dictionary',
  fields: [
    field('id', 'text', true, { immutable: true, max: 64 }),
    field('name', 'text', true, { max: 64 }),
    field('status', 'select', true, {
      options: [
        { value: 1, label: t('common.enabled') },
        { value: 0, label: t('common.disabled') },
      ],
    }),
    field('describe', 'textarea', false, { max: 200 }),
  ],
  columns: ['id', 'name', 'status', 'describe'],
  query: dictionary.getDic_page,
  save: dictionary.addDictionary,
  remove: dictionary.deleteDictionary,
  validate: async (data, editing) => {
    validateCode(data.id)
    validateLength(data.name, 64)
    validateLength(data.describe, 200)
    if (!editing && resultOf(await dictionary.verifyId(stringValue(data.id))) === true)
      throw new Error(t('system.duplicateId'))
  },
  editable: (record) => record.classified !== 'system',
  defaults: { status: 1 },
}
export function dictionaryItemDefinition(dictId: string): EntityDefinition {
  return {
    key: 'dictionary-item',
    title: 'system.dictionaryItems',
    permission: 'system/Dictionary',
    fields: [
      field('name', 'text', true, { max: 64, label: 'organization.itemName' }),
      field('value', 'text', true, { max: 64, label: 'organization.itemValue' }),
      field('text', 'text', true, { max: 64, label: 'organization.itemText' }),
    ],
    columns: ['name', 'value', 'text'],
    query: (query) =>
      dictionary.queryDicItem({
        ...query,
        sorts: [{ name: 'ordinal', order: 'asc' }],
        terms: scopedQueryTerms(query.terms, [{ column: 'dictId', termType: 'eq', value: dictId }]),
      }),
    save: (data) =>
      dictionary.saveDicItem({
        ...data,
        dictId,
        searchCode: `${stringValue(data.name)}:${stringValue(data.value)}:${stringValue(data.text)}`,
      }),
    remove: dictionary.deleteDicItem,
    validate: async (data) => {
      validateCode(data.name)
      validateLength(data.value, 64)
      validateLength(data.text, 64)
      const terms: QueryTerm[] = [
        { column: 'dictId', termType: 'eq', value: dictId },
        { column: 'value', termType: 'eq', value: data.value },
      ]
      if (data.id) terms.push({ column: 'id', termType: 'not', value: data.id })
      if (resultOf(await dictionary.verifyValue({ terms: [{ terms }] })) === true)
        throw new Error(t('organization.itemChanged'))
    },
    defaults: { dictId, ordinal: 1 },
  }
}
export function exportDictionaryQuery(ids: string[]): Query {
  return { paging: false, terms: [{ terms: [{ column: 'id', termType: 'in', value: ids }] }] }
}
