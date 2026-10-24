import type { ServerMenu } from '../../src/shared/auth/types'
const actions = [
  'view',
  'query',
  'add',
  'update',
  'delete',
  'action',
  'bind-user',
  'bind',
  'assert',
  'import',
  'export',
  'groupUpdate',
  'groupDelete',
  'down',
]
const leaf = (code: string, name: string, url: string): ServerMenu => ({
  id: code,
  code,
  name,
  url,
  owner: 'iot',
  granted: true,
  buttons: actions.map((id) => ({ id, name: id, granted: true })),
})
export function systemMenus(core: ServerMenu[]): ServerMenu[] {
  return [
    core[0],
    {
      id: 'system-root',
      code: 'system',
      owner: 'iot',
      name: '系统管理',
      url: '/system',
      children: [
        {
          id: 'identity',
          code: 'identity',
          owner: 'iot',
          name: '权限管理',
          children: [...core.slice(1, 5), ...core.slice(6)].map((row) => ({
            ...row,
            icon: row.code === 'system/User' ? 'UserOutlined' : row.icon,
            buttons: actions.map((id) => ({ id, name: id, granted: true })),
          })),
        },
        {
          id: 'organization',
          code: 'organization',
          owner: 'iot',
          name: '组织与职位',
          children: [
            leaf('system/Department', '组织管理', '/system/Department'),
            leaf('system/Positions', '职位管理', '/system/positions'),
          ],
        },
        {
          id: 'configuration',
          code: 'configuration',
          owner: 'iot',
          name: '系统配置',
          children: [
            leaf('system/Basis', '基础配置', '/system/Basis'),
            leaf('system/Dictionary', '数据字典', '/system/Dictionary'),
          ],
        },
        {
          id: 'operations',
          code: 'operations',
          owner: 'iot',
          name: '运维管理',
          children: [core[5], leaf('system/Log/System', '系统日志', '/system/Log/System')],
        },
      ],
    },
  ]
}
