export type Model = Record<string, unknown>

export interface SystemRecord extends Model {
  id: string
  name: string
  children?: SystemRecord[]
}

export interface Entity {
  id: string
  name: string
  description?: string
  [key: string]: unknown
}

export interface RelatedSaveMessage {
  type: 'proto-related-record-saved'
  sourceId: string
  id: string
}
