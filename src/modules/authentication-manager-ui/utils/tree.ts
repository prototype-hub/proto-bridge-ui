import type { DataNode } from 'ant-design-vue/es/vc-tree/interface'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
export function treeNodes(rows: SystemRecord[]): DataNode[] {
  return rows.map((row) => ({
    ...row,
    key: row.id,
    title: row.name,
    children: row.children ? treeNodes(row.children) : undefined,
  }))
}
