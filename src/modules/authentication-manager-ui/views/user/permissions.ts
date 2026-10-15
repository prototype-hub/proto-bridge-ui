export const authPermissions = {
  users: {
    add: 'system/User:add',
    edit: 'system/User:update',
    delete: 'system/User:delete',
    status: 'system/User:action',
  },
} as const
