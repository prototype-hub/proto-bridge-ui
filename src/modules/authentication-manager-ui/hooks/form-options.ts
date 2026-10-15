import type { FormContext, SelectOption } from '@/modules/authentication-manager-ui/types/forms'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import { recordsOf } from '@/modules/authentication-manager-ui/utils/model'
import * as departments from '@/modules/authentication-manager-ui/api/department/department'
import * as positions from '@/modules/authentication-manager-ui/api/position/positions'
import * as users from '@/modules/authentication-manager-ui/api/user/user'
import * as roles from '@/modules/authentication-manager-ui/api/role/role'
export async function formOptions(
  requested = ['roles', 'organizations', 'positions', 'users'],
): Promise<FormContext> {
  const fetchers: Record<string, () => Promise<unknown>> = {
    roles: () => roles.getRoleListNoPaging_api(),
    organizations: () => departments.getTreeData_api({ paging: false }),
    positions: () => positions.queryPositionDetailNoPage({ paging: false }),
    users: () => users.queryUserListNoPaging(),
  }
  const names = [...new Set(requested)].filter((name) => fetchers[name])
  const responses = await Promise.allSettled(names.map((name) => fetchers[name]()))
  const options = (rows: SystemRecord[]): SelectOption[] =>
    rows.map((row) => ({
      value: row.id,
      label: row.name,
      children: row.children ? options(row.children) : undefined,
    }))
  return Object.fromEntries(
    responses.map((item, index) => [
      names[index],
      item.status === 'fulfilled' ? options(recordsOf(item.value)) : [],
    ]),
  )
}
