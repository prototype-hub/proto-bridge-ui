import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import type { Query } from '@/shared/api/types'
import type { EntityDefinition } from '@/modules/authentication-manager-ui/types/dictionary'
import { useEntity } from '@/modules/authentication-manager-ui/views/dictionary/hooks/useEntity'
import { useOrganizationRecords } from '@/modules/authentication-manager-ui/hooks/useOrganizationRecords'
import {
  useBindingUsers,
  type BindingScope,
} from '@/modules/authentication-manager-ui/hooks/useBindingUsers'
import { scopedQueryTerms } from '@/modules/authentication-manager-ui/utils/query-scope'
import { request } from '@/shared/api/client'

vi.mock('@/shared/api/client', () => ({ request: { post: vi.fn() } }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}
function response(id: string, total = 1) {
  return { success: true, status: 200, result: { data: [{ id, name: id }], total } }
}
function setup<T>(initialize: () => T) {
  let state!: T
  const wrapper = mount(
    defineComponent({
      setup() {
        state = initialize()
        return () => h('div')
      },
    }),
  )
  return { state, wrapper }
}
function definition(query: EntityDefinition['query']): EntityDefinition {
  return {
    key: 'records',
    title: 'common.name',
    permission: 'system/Dictionary',
    fields: [],
    columns: ['name'],
    query,
  }
}

beforeEach(() => vi.mocked(request.post).mockReset())

describe('system query adapters', () => {
  it('loads entities once on mount and follows a changed definition without stale rows or totals', async () => {
    const older = deferred<unknown>()
    const oldQuery = vi.fn<EntityDefinition['query']>().mockReturnValue(older.promise)
    const latestQuery = vi.fn<EntityDefinition['query']>().mockResolvedValue(response('latest', 23))
    const source = shallowRef(definition(oldQuery))
    const { state, wrapper } = setup(() => useEntity(() => source.value))
    try {
      expect(oldQuery).toHaveBeenCalledTimes(1)
      source.value = definition(latestQuery)
      const filter: Query = { terms: [{ column: 'name', value: 'latest' }] }
      await state.search(filter)
      expect(latestQuery).toHaveBeenCalledWith({
        ...filter,
        pageIndex: 0,
        pageSize: 20,
        sorts: [{ name: 'createTime', order: 'desc' }],
      })
      expect(latestQuery.mock.calls[0]).toHaveLength(1)
      expect(state.list.data.value.map((row) => row.id)).toEqual(['latest'])
      expect(state.pagination.total).toBe(23)
      older.resolve(response('older', 999))
      await flushPromises()
      expect(state.list.data.value.map((row) => row.id)).toEqual(['latest'])
      expect(state.pagination.total).toBe(23)
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps organization loading manual and retains an OR filter inside its fixed scope across pagination', async () => {
    const owner = ref('org-a')
    const fetcher = vi
      .fn<(query: Query) => Promise<unknown>>()
      .mockResolvedValue(response('asset', 8))
    const { state, wrapper } = setup(() =>
      useOrganizationRecords((query) =>
        fetcher({
          ...query,
          terms: scopedQueryTerms(query.terms, [{ column: 'orgId', value: owner.value }]),
        }),
      ),
    )
    const filter: Query = {
      terms: [
        { column: 'name', value: 'A' },
        { column: 'name', value: 'B', type: 'or' },
      ],
    }
    try {
      expect(fetcher).not.toHaveBeenCalled()
      await state.search(filter)
      expect(fetcher.mock.calls[0]?.[0].terms).toEqual([
        { terms: filter.terms },
        { column: 'orgId', value: 'org-a' },
      ])
      await state.page(3, 20)
      expect(fetcher.mock.calls[1]?.[0]).toMatchObject({
        pageIndex: 2,
        pageSize: 20,
        terms: [{ terms: filter.terms }, { column: 'orgId', value: 'org-a' }],
      })
      owner.value = 'org-b'
      await state.search({ terms: [] })
      expect(fetcher.mock.calls[2]?.[0]).toMatchObject({
        pageIndex: 0,
        terms: [{ column: 'orgId', value: 'org-b' }],
      })
      expect(state.data.value.map((row) => row.id)).toEqual(['asset'])
      expect(state.pagination.total).toBe(8)
      expect(fetcher.mock.calls.every((call) => call.length === 1)).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps candidate loads lazy and source-driven members combine inherited organization users with AND filters', async () => {
    vi.mocked(request.post).mockResolvedValue(response('user', 4))
    const scope = ref<BindingScope>({
      type: 'position',
      id: 'p1',
      orgId: 'o1',
      permission: 'system/Positions',
    })
    const candidates = setup(() => useBindingUsers(() => scope.value, true))
    const filter: Query = {
      terms: [
        { column: 'name', value: 'A' },
        { column: 'username', value: 'B', type: 'or' },
      ],
    }
    try {
      expect(request.post).not.toHaveBeenCalled()
      await candidates.state.search(filter)
      expect(request.post).toHaveBeenLastCalledWith(
        '/user/detail/_query',
        expect.objectContaining({
          pageIndex: 0,
          pageSize: 12,
          terms: [
            { terms: filter.terms },
            { column: 'id$in-dimension$position$not', value: 'p1' },
            { column: 'username', termType: 'not', value: 'admin', type: 'and' },
          ],
        }),
        expect.objectContaining({ silent: true, signal: expect.any(AbortSignal) }),
      )
      expect(candidates.state.data.value.map((row) => row.id)).toEqual(['user'])
      scope.value = { type: 'org', id: 'o2', positionId: 'p2', permission: 'system/Department' }
      await nextTick()
      expect(request.post).toHaveBeenCalledTimes(1)

      const members = setup(() => useBindingUsers(() => scope.value))
      try {
        expect(request.post).toHaveBeenCalledTimes(2)
        await members.state.search(filter)
        expect(request.post).toHaveBeenLastCalledWith(
          '/user/detail/_query',
          expect.objectContaining({
            terms: [
              { terms: filter.terms },
              {
                terms: [
                  { terms: [{ column: 'id$in-org-user$org', value: ['o2'] }] },
                  { type: 'or', terms: [{ column: 'id$in-org-user$position', value: ['o2'] }] },
                ],
              },
              { column: 'id$in-dimension$position', value: 'p2' },
            ],
          }),
          expect.any(Object),
        )
        await members.state.search({ terms: [] })
        expect(members.state.positionFilter.value).toBe('')
        scope.value = { type: 'role', id: 'r1', permission: 'system/Role' }
        await flushPromises()
        expect(request.post).toHaveBeenLastCalledWith(
          '/user/_query/',
          expect.objectContaining({
            pageSize: 12,
            terms: [{ column: 'id$in-dimension$role', value: 'r1' }],
          }),
          expect.any(Object),
        )
      } finally {
        members.wrapper.unmount()
      }
    } finally {
      candidates.wrapper.unmount()
    }
  })
})
