import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest'
import { request } from '@/shared/api/client'
import {
  parentOptions,
  nextOrganizationOrder,
  organizationMemberTerms,
} from '@/modules/authentication-manager-ui/utils/organization'
import { validateOrganization } from '@/modules/authentication-manager-ui/views/department/definition'
import {
  positionDetail,
  positionQuery,
  savePosition,
} from '@/modules/authentication-manager-ui/views/position/definition'
import {
  dictionaryItemDefinition,
  exportDictionaryQuery,
} from '@/modules/authentication-manager-ui/views/dictionary/definition'
import { scopedQueryTerms } from '@/modules/authentication-manager-ui/utils/query-scope'
import { memberTerms } from '@/modules/authentication-manager-ui/hooks/useBindingUsers'
import { i18n } from '@/shared/i18n'
import { organizationZh, organizationEn } from '@/modules/authentication-manager-ui/locale-messages'
beforeAll(() => {
  i18n.global.mergeLocaleMessage('zh', { organization: organizationZh })
  i18n.global.mergeLocaleMessage('en', { organization: organizationEn })
})
vi.mock('@/shared/api/client', () => ({
  request: Object.fromEntries(
    ['get', 'post', 'put', 'patch', 'remove'].map((method) => [
      method,
      vi.fn(async () => ({ result: false })),
    ]),
  ),
}))
beforeEach(() => vi.clearAllMocks())
describe('organization and position production contracts', () => {
  it('parses the actual no-paging position result array and compatible single objects', () => {
    const row = { id: 'p1', orgId: 'org', name: 'Engineer' }
    expect(positionDetail({ result: [row] })).toMatchObject(row)
    expect(positionDetail({ result: row })).toMatchObject(row)
    expect(positionDetail({ result: [] })).toBeUndefined()
  })
  it('maps role search through nested conditions while retaining organization and parent IDs', () => {
    expect(
      positionQuery({
        terms: [
          {
            terms: [
              { column: 'roles', termType: 'eq', value: 'role' },
              { column: 'orgId', termType: 'eq', value: 'org' },
              { column: 'parentId', termType: 'eq', value: 'p0' },
            ],
          },
        ],
      }),
    ).toEqual({
      terms: [
        {
          terms: [
            { column: 'id$position-role$position', termType: undefined, value: 'role' },
            { column: 'orgId', termType: 'eq', value: 'org' },
            { column: 'parentId', termType: 'eq', value: 'p0' },
          ],
        },
      ],
    })
  })
  it('queries organization users and users inherited through its positions with OR', () => {
    expect(organizationMemberTerms('org')).toEqual([
      {
        terms: [
          { terms: [{ column: 'id$in-org-user$org', value: ['org'] }] },
          { type: 'or', terms: [{ column: 'id$in-org-user$position', value: ['org'] }] },
        ],
      },
    ])
    expect(memberTerms({ type: 'org', id: 'org', permission: 'system/Department' }, true)).toEqual([
      { column: 'id$in-dimension$org$not', value: 'org' },
    ])
    expect(
      memberTerms(
        { type: 'position', id: 'p', orgId: 'org', permission: 'system/Department' },
        true,
      ),
    ).toContainEqual({ column: 'username', termType: 'not', value: 'admin', type: 'and' })
  })
  it('preserves the legacy organization-scoped array save and role object payload', async () => {
    await savePosition({ id: 'p', orgId: 'org', roles: ['role'], __editing: true }, true)
    expect(request.patch).toHaveBeenCalledWith('/position/org/_save', [
      { id: 'p', orgId: 'org', roles: [{ id: 'role' }] },
    ])
  })
  it('creates a position when its ID and optional parent are both absent', async () => {
    await savePosition({ name: 'New position', orgId: 'org', roles: ['role'] }, false)
    expect(request.post).toHaveBeenCalledWith('/position/org/_create', {
      name: 'New position',
      orgId: 'org',
      roles: [{ id: 'role' }],
    })
  })
  it('keeps OR search conditions grouped inside required binding eligibility', () => {
    const search = [
      { column: 'name', termType: 'like', value: 'Engineer' },
      { column: 'username', termType: 'like', value: 'operator', type: 'or' as const },
    ]
    const eligibility = memberTerms(
      { type: 'position', id: 'p', orgId: 'org', permission: 'system/Department' },
      true,
    )
    expect(scopedQueryTerms(search, eligibility)).toEqual([{ terms: search }, ...eligibility])
  })
  it('excludes self and descendants from organization parent selection and uses maximum sort order', () => {
    const rows = [
      {
        id: 'org',
        name: 'Root',
        sortIndex: 5,
        children: [
          { id: 'child', name: 'Child', sortIndex: 9 },
          { id: 'other', name: 'Other', sortIndex: 2 },
        ],
      },
      { id: 'separate', name: 'Separate', sortIndex: 20 },
    ]
    expect(parentOptions(rows, 'org')).toEqual([
      { value: 'separate', label: 'Separate', children: [] },
    ])
    expect(nextOrganizationOrder(rows, 'org')).toBe(10)
    expect(nextOrganizationOrder(rows)).toBe(21)
    expect(() =>
      validateOrganization({ id: 'org', parentId: 'child', sortIndex: 1 }, rows),
    ).toThrow()
    expect(() => validateOrganization({ name: 'Bad', sortIndex: 0 }, rows)).toThrow()
  })
})
describe('dictionary production contracts', () => {
  it('exports only selected IDs in the original nested in query', () => {
    expect(exportDictionaryQuery(['d1', 'd2'])).toEqual({
      paging: false,
      terms: [{ terms: [{ column: 'id', termType: 'in', value: ['d1', 'd2'] }] }],
    })
  })
  it('uses ordinal order and validates edited values with an ID exclusion', async () => {
    const definition = dictionaryItemDefinition('dict')
    await definition.query({ sorts: [{ name: 'createTime', order: 'desc' }] })
    expect(request.post).toHaveBeenCalledWith('/dictionary-item/_query', {
      sorts: [{ name: 'ordinal', order: 'asc' }],
      terms: [{ column: 'dictId', termType: 'eq', value: 'dict' }],
    })
    await definition.validate?.(
      { id: 'item', name: 'name', value: 'changed', text: 'Changed' },
      true,
    )
    expect(request.post).toHaveBeenCalledWith('/dictionary-item/_exists', {
      terms: [
        {
          terms: [
            { column: 'dictId', termType: 'eq', value: 'dict' },
            { column: 'value', termType: 'eq', value: 'changed' },
            { column: 'id', termType: 'not', value: 'item' },
          ],
        },
      ],
    })
  })
  it('rejects invalid item codes and edited duplicate values', async () => {
    const definition = dictionaryItemDefinition('dict')
    await expect(
      definition.validate?.({ name: '中文名称', value: 'value', text: 'Text' }, false),
    ).rejects.toThrow()
    vi.mocked(request.post).mockResolvedValueOnce({ result: true } as never)
    await expect(
      definition.validate?.({ id: 'item', name: 'name', value: 'duplicate', text: 'Text' }, true),
    ).rejects.toThrow()
  })
})
