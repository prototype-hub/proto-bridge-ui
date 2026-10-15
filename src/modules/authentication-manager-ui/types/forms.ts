export interface SelectOption {
  value: string | number
  label: string
  children?: SelectOption[]
}

export type FormContext = Record<string, SelectOption[]>

export interface Field {
  key: string
  label: string
  kind?:
    | 'text'
    | 'password'
    | 'textarea'
    | 'number'
    | 'switch'
    | 'select'
    | 'multiple'
    | 'tree'
    | 'json'
    | 'file'
    | 'color'
  required?: boolean
  max?: number
  immutable?: boolean
  section?: string
  options?: SelectOption[]
  source?: string
  when?: { key: string; values: (string | boolean)[] }
  conditions?: { key: string; values: (string | boolean)[] }[]
}
