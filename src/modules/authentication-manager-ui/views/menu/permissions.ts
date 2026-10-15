export const authPermissions = {
  menus: { add: 'system/Menu:add', edit: 'system/Menu:update', delete: 'system/Menu:delete' },
} as const
export const systemPermissions = {
  menu: {
    export: 'system/Menu:export',
    import: 'system/Menu:import',
    update: 'system/Menu:update',
  },
} as const
