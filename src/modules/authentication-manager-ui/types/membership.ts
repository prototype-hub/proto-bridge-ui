export interface BindingScope {
  type: 'org' | 'position' | 'role'
  id: string
  orgId?: string
  positionId?: string
  permission: string
  bindAction?: string
}
