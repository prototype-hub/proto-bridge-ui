import type { Query } from '@/shared/api/types'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import type { Field } from '@/modules/authentication-manager-ui/types/forms'

export interface EntityDefinition {
  key: string
  title: string
  permission: string
  fields: Field[]
  columns: string[]
  query: (query: Query) => Promise<unknown>
  save?: (data: Model, editing: boolean) => Promise<unknown>
  remove?: (id: string) => Promise<unknown>
  validate?: (data: Model, editing: boolean) => Promise<void>
  actions?: Partial<Record<'add' | 'update' | 'delete' | 'import' | 'export', string>>
  editable?: (record: Model) => boolean
  import?: (rows: Model[]) => Promise<unknown>
  defaults?: Model
  export?: (query: Query) => Promise<unknown>
}
