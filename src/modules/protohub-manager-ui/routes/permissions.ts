export const protoPermissions = {
  project: {
    query: 'prototype-hub-project:query',
    save: 'prototype-hub-project:save',
    delete: 'prototype-hub-project:delete',
  },
  version: {
    query: 'prototype-hub-version:query',
    save: 'prototype-hub-version:save',
    delete: 'prototype-hub-version:delete',
  },
  share: {
    query: 'prototype-hub-share:query',
    save: 'prototype-hub-share:save',
    delete: 'prototype-hub-share:delete',
  },
} as const
