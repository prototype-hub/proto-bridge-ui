import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, effectScope, h, nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { request } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/api/types'
import type { ServerMenu } from '@/shared/auth/types'
import type { Role } from '@/modules/authentication-manager-ui/types/role'
import { useRoleDetail } from '@/modules/authentication-manager-ui/views/role/hooks/useRoleDetail'
import { useRelatedRecord } from '@/modules/authentication-manager-ui/hooks/useRelatedRecord'
import { usersApi } from '@/modules/authentication-manager-ui/api/user/users'
import { userIdentityApi } from '@/modules/authentication-manager-ui/api/user/user-types'
import { rolesApi } from '@/modules/authentication-manager-ui/api/role/roles'
import { permissionsApi } from '@/modules/authentication-manager-ui/api/permission/resources'
import { roleIdentityApi } from '@/modules/authentication-manager-ui/api/role/role-options'
import { identityRows } from '../fixtures/identity-query'
import {
  enabled,
  optionIds,
  scopedIdentityTerms,
} from '@/modules/authentication-manager-ui/utils/identity'
import { userTerms, validPassword } from '@/modules/authentication-manager-ui/utils/user'
import {
  normalizeGrants,
  setAllGrants,
  setMenuGrant,
  setDataGrant,
  updateGrantStates,
  serializeRoleGrants,
} from '@/modules/authentication-manager-ui/views/role/utils/role-grants'
vi.mock('@/shared/api/client', () => ({
  request: Object.fromEntries(
    ['get', 'post', 'put', 'patch', 'remove'].map((name) => [
      name,
      vi.fn(async () => ({ result: [] })),
    ]),
  ),
}))
vi.mock('@/shared/utils/feedback', () => ({ saved: vi.fn(), deleted: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
it('reads canonical user type values/text and keeps released string and id/name options compatible', async () => {
  const types = [
    { value: 'normal', text: '普通用户', id: 'compat-normal', name: 'Ignored legacy label' },
    { value: 'admin', text: '管理员', id: 'admin' },
    'retired-type',
    { id: 'legacy', name: '历史用户类型' },
    null,
  ]
  vi.mocked(request.get).mockResolvedValueOnce({ success: true, status: 200, result: types })
  await expect(userIdentityApi.userTypes()).resolves.toEqual([
    { value: 'normal', text: '普通用户', id: 'compat-normal' },
    { value: 'admin', text: '管理员', id: 'admin' },
    { value: 'retired-type', text: 'retired-type' },
    { value: 'legacy', text: '历史用户类型', id: 'legacy' },
  ])
  expect(request.get).toHaveBeenCalledWith('/user/detail/types')
  vi.mocked(request.get).mockResolvedValueOnce({
    success: true,
    status: 200,
    result: { data: ['normal', 'admin'] },
  })
  await expect(userIdentityApi.userTypes()).resolves.toEqual([
    { value: 'normal', text: 'normal' },
    { value: 'admin', text: 'admin' },
  ])
})
it('sends user detail creation as the legacy nested user DTO and position IDs', async () => {
  await usersApi.save({
    username: 'operator',
    name: 'Operator',
    password: 'abcdefghijkl',
    confirmPassword: 'abcdefghijkl',
    roleIdList: ['r'],
    orgIdList: ['o'],
    positions: [{ id: 'p' }],
  })
  expect(request.post).toHaveBeenCalledWith('/user/detail/_create', {
    user: { username: 'operator', name: 'Operator', password: 'abcdefghijkl' },
    roleIdList: ['r'],
    orgIdList: ['o'],
    positions: ['p'],
  })
})
it('sends username and password checks as raw text and reads the passed-only backend response', async () => {
  vi.mocked(request.post).mockResolvedValueOnce({
    success: true,
    status: 200,
    result: { passed: false },
  })
  await expect(usersApi.validate('username', '中文用户')).resolves.toEqual({ passed: false })
  expect(request.post).toHaveBeenLastCalledWith('/user/username/_validate', '中文用户', {
    headers: { 'Content-Type': 'text/plain' },
  })
  vi.mocked(request.post).mockResolvedValueOnce({
    success: true,
    status: 200,
    result: { passed: true },
  })
  const password = ' leading and trailing '
  await expect(usersApi.validate('password', password)).resolves.toEqual({ passed: true })
  expect(request.post).toHaveBeenLastCalledWith('/user/password/_validate', password, {
    headers: { 'Content-Type': 'text/plain' },
  })
})
it('keeps IDs at both detail update levels and excludes reset-only and derived fields', async () => {
  await usersApi.save({
    id: 'u/1',
    username: 'operator',
    name: 'Operator',
    password: '',
    confirmPassword: 'discard',
    roleList: [{ id: 'r' }],
    orgList: [{ id: 'o' }],
    type: { value: 'admin', text: '管理员', id: 'admin' },
    typeId: 'admin',
    roleIdList: ['r'],
    orgIdList: ['o'],
  })
  expect(request.put).toHaveBeenCalledWith('/user/detail/u%2F1/_update', {
    id: 'u/1',
    user: { id: 'u/1', username: 'operator', name: 'Operator' },
    roleIdList: ['r'],
    orgIdList: ['o'],
    positions: [],
  })
})
it('preserves grouped user-detail and role/position relation searches', () => {
  expect(
    userTerms([
      {
        terms: [
          { column: 'email', termType: 'like', value: '%mail%' },
          { column: 'roleList', termType: 'nin', value: ['r'] },
          { column: 'positions', termType: 'in', value: ['p'] },
        ],
      },
    ])[0]?.terms,
  ).toEqual([
    {
      column: 'id$user-detail',
      value: [{ column: 'email', termType: 'like', value: '%mail%' }],
      type: undefined,
    },
    { column: 'id$in-dimension$role$not', value: ['r'], type: undefined },
    { column: 'id$in-dimension$position', value: ['p'], type: undefined },
  ])
  expect(
    userTerms([{ column: 'type', termType: 'eq', value: 'other' }])[0]?.terms?.map(
      (term) => term.termType,
    ),
  ).toEqual(['isnull', 'empty'])
})
it('handles numeric and enum status and the current backend password limits', () => {
  expect(enabled({ value: 'enabled', text: 'Enabled' })).toBe(true)
  expect(enabled('1')).toBe(true)
  expect(enabled(0)).toBe(false)
  expect(validPassword('Abcdef12')).toBe(false)
  expect(validPassword('abcdefghijkl')).toBe(true)
  expect(validPassword(' leading and trailing ')).toBe(true)
  expect(validPassword('a'.repeat(128))).toBe(true)
  expect(validPassword('a'.repeat(129))).toBe(false)
  expect(validPassword(' '.repeat(12))).toBe(false)
})
it('lets the server generate role IDs and excludes existing members/admin from candidates', async () => {
  await rolesApi.create({ id: '', name: 'Operators', groupId: 'default_group' })
  expect(request.post).toHaveBeenCalledWith('/role', {
    name: 'Operators',
    groupId: 'default_group',
  })
  await roleIdentityApi.roleUsers('r', { pageIndex: 0, pageSize: 20 }, true)
  expect(request.post).toHaveBeenCalledWith(
    '/user/_query/',
    expect.objectContaining({
      terms: [
        { column: 'id$in-dimension$role$not', value: 'r' },
        { column: 'username', termType: 'not', value: 'admin' },
      ],
    }),
  )
})
it('groups OR search conditions before mandatory role membership and group scopes', async () => {
  const terms = [
    { column: 'name', termType: 'like', value: '%Operator%' },
    { column: 'username', termType: 'like', value: '%admin%', type: 'or' as const },
  ]
  await roleIdentityApi.roleUsers('r', { terms }, true)
  expect(request.post).toHaveBeenCalledWith(
    '/user/_query/',
    expect.objectContaining({
      terms: [
        { terms },
        { column: 'id$in-dimension$role$not', value: 'r' },
        { column: 'username', termType: 'not', value: 'admin' },
      ],
    }),
  )
  expect(scopedIdentityTerms(terms, [{ column: 'groupId', value: 'default_group' }])).toEqual([
    { terms },
    { column: 'groupId', value: 'default_group' },
  ])
})
it('forwards role member query cancellation and transport options without changing its scope', async () => {
  const options = { signal: new AbortController().signal, silent: true }
  await roleIdentityApi.roleUsers('r', { pageIndex: 1, pageSize: 50 }, true, options)
  expect(request.post).toHaveBeenCalledWith(
    '/user/_query/',
    {
      pageIndex: 1,
      pageSize: 50,
      sorts: [{ name: 'createTime', order: 'desc' }],
      terms: [
        { column: 'id$in-dimension$role$not', value: 'r' },
        { column: 'username', termType: 'not', value: 'admin' },
      ],
    },
    options,
  )
})
it('ignores a delayed previous role grant response and only saves the loaded current role', async () => {
  function deferred() {
    let resolve!: (response: ApiResponse<ServerMenu[]>) => void
    const promise = new Promise<ApiResponse<ServerMenu[]>>((complete) => (resolve = complete))
    return { promise, resolve }
  }
  const first = deferred(),
    second = deferred()
  const get = vi.mocked(request.get)
  get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const scope = effectScope(),
    role = ref<Role>(),
    detail = scope.run(() => useRoleDetail(role))!
  try {
    role.value = { id: 'A', name: 'Role A' }
    await nextTick()
    const firstSignal = get.mock.calls[0]?.[2]?.signal
    role.value = { id: 'B', name: 'Role B' }
    await nextTick()
    expect(firstSignal?.aborted).toBe(true)
    await detail.save()
    expect(request.put).not.toHaveBeenCalled()
    second.resolve({
      success: true,
      status: 200,
      result: [{ id: 'menu-B', code: 'menu-B', name: 'B menu', granted: true }],
    })
    await flushPromises()
    first.resolve({
      success: true,
      status: 200,
      result: [{ id: 'menu-A', code: 'menu-A', name: 'A menu', granted: true }],
    })
    await flushPromises()
    expect(detail.grants.value.map((menu) => menu.id)).toEqual(['menu-B'])
    await detail.save()
    expect(request.put).toHaveBeenCalledOnce()
    expect(request.put).toHaveBeenCalledWith('/menu/role/B/_grant', {
      menus: [expect.objectContaining({ id: 'menu-B' })],
    })
    role.value = undefined
    await nextTick()
    await detail.save()
    expect(request.put).toHaveBeenCalledOnce()
  } finally {
    scope.stop()
  }
})
it('rejects a popup from an earlier editor session and retries a failed association refresh', async () => {
  const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    selected = vi.fn(),
    session = ref<number | undefined>(1)
  let related!: ReturnType<typeof useRelatedRecord>
  const opened = vi.spyOn(window, 'open').mockReturnValue(window)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/system/Role', component: { render: () => null } }],
  })
  const wrapper = mount(
    defineComponent({
      setup() {
        related = useRelatedRecord(refresh, selected, () => session.value)
        return () => h('div')
      },
    }),
    { global: { plugins: [router] } },
  )
  function sendSaved(index: number, id: string) {
    const sourceId = new URL(
      String(opened.mock.calls[index]?.[0]),
      window.location.href,
    ).searchParams.get('sourceId')
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        source: window,
        data: { type: 'proto-related-record-saved', sourceId, id },
      }),
    )
  }
  try {
    related.openRelated('role')
    session.value = 2
    sendSaved(0, 'old-role')
    await flushPromises()
    expect(refresh).not.toHaveBeenCalled()
    expect(selected).not.toHaveBeenCalled()
    related.openRelated('role')
    refresh.mockRejectedValueOnce(new Error('Options refresh failed'))
    sendSaved(1, 'new-role')
    await flushPromises()
    expect(related.relatedError.value).toBe('Options refresh failed')
    expect(selected).not.toHaveBeenCalled()
    await related.retryRelated()
    expect(selected).toHaveBeenCalledOnce()
    expect(selected).toHaveBeenCalledWith('role', 'new-role')
    expect(related.relatedError.value).toBe('')
  } finally {
    wrapper.unmount()
    opened.mockRestore()
  }
})
it('filters direct organization candidates and members inherited from positions', () => {
  const rows = [
    { id: 'direct', orgIdList: ['org1'], positions: [] },
    { id: 'inherited', orgIdList: [], positions: [{ id: 'position1', orgId: 'org1' }] },
    { id: 'eligible', orgIdList: [], positions: [] },
  ]
  expect(
    identityRows(rows, {
      terms: [{ column: 'id$in-dimension$org$not', value: 'org1' }],
    }).map((row) => row.id),
  ).toEqual(['inherited', 'eligible'])
  expect(
    identityRows(rows, {
      terms: [
        {
          terms: [
            { column: 'id$in-org-user$org', value: ['org1'] },
            { type: 'or', column: 'id$in-org-user$position', value: ['org1'] },
          ],
        },
      ],
    }).map((row) => row.id),
  ).toEqual(['direct', 'inherited'])
})
it('keeps mandatory personal-center access through bulk deselection and cascades descendants', () => {
  const menus = normalizeGrants([
    {
      id: 'personal',
      code: 'account-center',
      name: 'Personal',
      buttons: [{ id: 'view', name: 'View' }],
    },
    {
      id: 'system',
      code: 'system',
      name: 'System',
      children: [
        {
          id: 'users',
          code: 'users',
          name: 'Users',
          buttons: [
            { id: 'query', name: 'Query' },
            { id: 'save', name: 'Save' },
          ],
        },
      ],
    },
  ])
  setAllGrants(menus, true)
  expect(menus[1]?.children?.[0]?.buttons?.every((button) => button.granted)).toBe(true)
  setAllGrants(menus, false)
  expect(menus[0]?.granted).toBe(true)
  expect(menus[0]?.buttons?.[0]?.granted).toBe(true)
  expect(menus[1]?.children?.[0]?.buttons?.some((button) => button.granted)).toBe(false)
})
it('serializes partially selected operations and data grants without UI metadata', () => {
  const menus = normalizeGrants([
    {
      id: 'users',
      code: 'users',
      name: 'Users',
      accessSupport: { value: 'support' },
      buttons: [
        { id: 'query', name: 'Query' },
        { id: 'save', name: 'Save' },
      ],
      assetAccesses: [
        { supportId: 'creator', name: 'Own' },
        { supportId: 'all', name: 'All' },
      ],
    },
  ])
  setMenuGrant(menus, menus[0]!, true)
  menus[0]!.buttons![1]!.granted = false
  updateGrantStates(menus)
  expect(menus[0]?.indeterminate).toBe(true)
  setDataGrant(menus[0]!, 'all')
  const output = serializeRoleGrants(menus)
  expect(output[0]?.granted).toBe(true)
  expect(output[0]?.buttons?.find((button) => button.id === 'query')?.granted).toBe(true)
  expect(output[0]?.buttons?.find((button) => button.id === 'save')?.granted).toBe(false)
  expect(output[0]?.assetAccesses).toEqual([
    { supportId: 'creator', name: 'Own', granted: false },
    { supportId: 'all', name: 'All', granted: true },
  ])
  expect(output[0]).not.toHaveProperty('indeterminate')
})
it('imports permission resources atomically and explicitly exports without paging', async () => {
  const rows = [{ id: 'resource', name: 'Resource', actions: [{ action: 'query', name: 'Query' }] }]
  await permissionsApi.save(rows)
  expect(request.patch).toHaveBeenCalledWith('/permission', rows)
  await permissionsApi.export({ terms: [{ column: 'name', termType: 'eq', value: 'Resource' }] })
  expect(request.post).toHaveBeenCalledWith('/permission/_query/no-paging', {
    paging: false,
    terms: [{ column: 'name', termType: 'eq', value: 'Resource' }],
  })
})

it('recognizes nested organization options before preserving unavailable detail labels', () => {
  expect(
    optionIds([
      {
        value: 'root',
        label: 'Root',
        children: [
          { value: 'child', label: 'Child', children: [{ value: 'leaf', label: 'Leaf' }] },
        ],
      },
    ]),
  ).toEqual(['root', 'child', 'leaf'])
})
