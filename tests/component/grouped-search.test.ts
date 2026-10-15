import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { Select } from 'ant-design-vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { request } from '@/shared/api/client'
import type { ApiResponse, Query, QueryField, QueryTerm, RequestOptions } from '@/shared/api/types'
import ProQuery from '@/shared/components/ProQuery.vue'
import QueryHistory from '@/shared/components/QueryHistory.vue'
import QueryRow from '@/shared/components/QueryRow.vue'
import QueryValue from '@/shared/components/QueryValue.vue'
import { common } from '@/shared/i18n/common'
import { systemLocales } from '@/modules/authentication-manager-ui/locale-messages'

vi.mock('@/shared/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/client')>()),
  request: { get: vi.fn(), post: vi.fn(), remove: vi.fn() },
}))
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: { common: common.en, system: systemLocales.en } },
})
const fields: QueryField[] = [
  { key: 'name', label: 'common.name' },
  {
    key: 'status',
    label: 'common.status',
    type: 'select',
    options: [{ label: 'Disabled', value: 0 }],
  },
]
const mounted: VueWrapper[] = []
async function render(options: { fields?: QueryField[]; target?: string } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/users', meta: { menuCode: 'system/User' }, component: { render: () => null } },
    ],
  })
  await router.push('/users')
  const wrapper = mount(ProQuery, {
    props: { fields, ...options },
    attachTo: document.body,
    global: { plugins: [i18n, router] },
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}
function row(wrapper: VueWrapper, path: string) {
  return wrapper
    .findAllComponents(QueryRow)
    .find((component) => component.attributes('data-query-row') === path)!
}
function lastQuery(wrapper: VueWrapper): Query {
  return wrapper.emitted('search')!.at(-1)![0] as Query
}
async function openHistory(wrapper: VueWrapper) {
  await wrapper.find('button[aria-label="Search records"]').trigger('click')
  await flushPromises()
  const body = new DOMWrapper(document.body)
  await vi.waitFor(() => expect(body.find('.query-history-menu').exists()).toBe(true))
  return body
}
function result(rows: unknown[]): ApiResponse<unknown[]> {
  return { success: true, status: 200, result: rows }
}
beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() })),
  )
  const style = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => style(element))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    },
  )
})
beforeEach(() => {
  vi.mocked(request.get).mockResolvedValue(result([]))
  vi.mocked(request.post).mockResolvedValue(result([]))
  vi.mocked(request.remove).mockResolvedValue(result([]))
})
afterEach(async () => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  await flushPromises()
  document.body.innerHTML = ''
})
afterAll(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('shows only editable compact controls and restores group controls without reloading history', async () => {
  const callsBefore = vi.mocked(request.get).mock.calls.length
  const wrapper = await render()
  const history = wrapper.find('.query-history').element
  expect(wrapper.findAllComponents(QueryHistory)).toHaveLength(1)
  expect(wrapper.findAll('.query-row')).toHaveLength(1)
  expect(wrapper.find('.query-field').exists()).toBe(true)
  expect(wrapper.find('.query-operator').exists()).toBe(true)
  expect(wrapper.findComponent(QueryValue).exists()).toBe(true)
  expect(wrapper.find('.query-row-label').exists()).toBe(false)
  expect(wrapper.find('.query-row-relation').exists()).toBe(false)
  expect(wrapper.find('.query-remove-condition').exists()).toBe(false)

  await wrapper.find('button[aria-label="More filters"]').trigger('click')
  expect(wrapper.findAll('.query-row')).toHaveLength(6)
  expect(row(wrapper, '0.0').find('.query-row-label').text()).toBe(systemLocales.en.firstQueryGroup)
  expect(row(wrapper, '0.1').find('.query-row-relation').exists()).toBe(true)
  expect(row(wrapper, '0.0').find('.query-remove-condition').exists()).toBe(true)
  expect(wrapper.findAllComponents(QueryHistory)).toHaveLength(1)
  expect(wrapper.find('.query-history').element).toBe(history)

  await wrapper.find('button[aria-label="Collapse filters"]').trigger('click')
  expect(wrapper.find('.query-row-label').exists()).toBe(false)
  expect(wrapper.find('.query-row-relation').exists()).toBe(false)
  expect(wrapper.find('.query-remove-condition').exists()).toBe(false)
  expect(wrapper.find('.query-history').element).toBe(history)
  expect(
    vi
      .mocked(request.get)
      .mock.calls.slice(callsBefore)
      .map(([url]) => url),
  ).toEqual(['/user/settings/system-user'])
})

it('keeps hidden active groups and zero values when collapsing, then resets the entire query', async () => {
  const wrapper = await render()
  expect(wrapper.findAll('.query-row')).toHaveLength(1)
  await row(wrapper, '0.0').findComponent(QueryValue).vm.$emit('update:modelValue', 'Alice')
  await wrapper.find('button[aria-label="More filters"]').trigger('click')
  expect(wrapper.findAll('.query-row')).toHaveLength(6)
  const second = row(wrapper, '1.0')
  second.find('.query-field').findComponent(Select).vm.$emit('update:value', 'status')
  await flushPromises()
  second.findComponent(QueryValue).vm.$emit('update:modelValue', 0)
  await flushPromises()
  await wrapper.find('.query-group-relation').findComponent(Select).vm.$emit('update:value', 'or')
  await wrapper.find('button[aria-label="Collapse filters"]').trigger('click')
  expect(wrapper.findAll('.query-row')).toHaveLength(1)
  expect(wrapper.find('.query-hidden-count').text()).toContain('1 more active')
  await wrapper.find('button[aria-label="Search"]').trigger('click')
  expect(lastQuery(wrapper).terms).toEqual([
    { terms: [{ column: 'name', termType: 'like', value: '%Alice%' }] },
    { type: 'or', terms: [{ type: 'or', column: 'status', termType: 'eq', value: 0 }] },
  ])
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Reset')!
    .trigger('click')
  expect(lastQuery(wrapper)).toEqual({ terms: [] })
  expect(wrapper.find('.query-hidden-count').exists()).toBe(false)
})

it('saves the raw versioned draft and restores it without multiplying field transformations', async () => {
  const transform = vi.fn((term: QueryTerm) => ({ ...term, value: Number(term.value) + 1 }))
  const saved: { key: string; name: string; content: string }[] = []
  vi.mocked(request.get).mockImplementation(async () => result(saved))
  vi.mocked(request.post).mockImplementation(async (_url, body) => {
    saved.push({ key: 'search/key', ...(body as { name: string; content: string }) })
    return result([])
  })
  vi.mocked(request.remove).mockImplementation(async () => {
    saved.splice(0)
    return result([])
  })
  const wrapper = await render({
    fields: [{ key: 'count', label: 'common.name', type: 'number', transform }],
  })
  row(wrapper, '0.0').findComponent(QueryValue).vm.$emit('update:modelValue', 0)
  await wrapper.find('button[aria-label="Save query"]').trigger('click')
  let body = new DOMWrapper(document.body)
  await body.find('.ant-modal input').setValue('Zero count')
  await body.find('.ant-modal-footer .ant-btn-primary').trigger('click')
  await flushPromises()
  expect(request.post).toHaveBeenCalledWith(
    '/user/settings/system-user',
    expect.objectContaining({ name: 'Zero count', content: expect.any(String) }),
  )
  const draft = JSON.parse(saved[0]!.content)
  expect(draft.version).toBe(1)
  expect(draft.terms).toHaveLength(2)
  expect(draft.terms[0].terms).toHaveLength(3)
  expect(draft.terms[0].terms[0]).toEqual({ column: 'count', termType: 'eq', value: 0 })
  expect(draft.terms[1]).toEqual({ type: 'and', terms: Array(3).fill({ type: 'or' }) })
  expect(transform).not.toHaveBeenCalled()
  body = await openHistory(wrapper)
  await body.find('.query-history-menu [role="menuitem"]').trigger('click')
  await flushPromises()
  expect(lastQuery(wrapper).terms).toEqual([{ column: 'count', termType: 'eq', value: 1 }])
  expect(transform).toHaveBeenCalledTimes(1)
  await wrapper.find('button[aria-label="Search"]').trigger('click')
  expect(lastQuery(wrapper).terms).toEqual([{ column: 'count', termType: 'eq', value: 1 }])
  await wrapper.find('button[aria-label="Delete saved search"]').trigger('click')
  await flushPromises()
  await vi.waitFor(() =>
    expect(body.find('.ant-popconfirm-buttons .ant-btn-primary').exists()).toBe(true),
  )
  await body.find('.ant-popconfirm-buttons .ant-btn-primary').trigger('click')
  await flushPromises()
  expect(request.remove).toHaveBeenCalledWith('/user/settings/system-user/search%2Fkey')
  expect(wrapper.find('button[aria-label="Delete saved search"]').exists()).toBe(false)
})

it('keeps nested legacy wire predicates intact and reports malformed history visibly', async () => {
  const transform = vi.fn((term: QueryTerm) => ({ ...term, value: Number(term.value) + 1 }))
  const terms: QueryTerm[] = [
    {
      terms: [
        { column: 'count', termType: 'eq', value: 7 },
        { type: 'or', terms: [{ column: 'backend-column', termType: 'eq', value: 'unchanged' }] },
      ],
    },
  ]
  vi.mocked(request.get).mockResolvedValue(
    result([
      { id: 'legacy', name: 'Legacy', content: JSON.stringify({ terms }) },
      { id: 'broken', name: 'Broken', content: '{"terms":"bad"}' },
    ]),
  )
  const wrapper = await render({
    fields: [{ key: 'count', label: 'common.name', type: 'number', transform }],
  })
  let body = await openHistory(wrapper)
  await body
    .findAll('.query-history-menu [role="menuitem"]')
    .find((item) => item.text() === 'Broken')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.find('.query-history-error').exists()).toBe(true)
  expect(wrapper.emitted('search')).toBeUndefined()
  body = await openHistory(wrapper)
  await body
    .findAll('.query-history-menu [role="menuitem"]')
    .find((item) => item.text() === 'Legacy')!
    .trigger('click')
  await flushPromises()
  expect(lastQuery(wrapper).terms).toEqual(terms)
  expect(JSON.stringify(lastQuery(wrapper))).not.toContain('__queryWire')
  expect(wrapper.findAll('.query-row')).toHaveLength(2)
  expect(
    wrapper.findAll('.query-field').some((field) => field.text().includes('backend-column')),
  ).toBe(true)
  expect(transform).not.toHaveBeenCalled()
  await wrapper.find('button[aria-label="Search"]').trigger('click')
  expect(lastQuery(wrapper).terms).toEqual(terms)
})

it('isolates target races and keeps searching available when loading history fails', async () => {
  const pending = new Map<
    string,
    { resolve: (value: ApiResponse<unknown>) => void; signal?: RequestOptions['signal'] }
  >()
  vi.mocked(request.get).mockImplementation(
    (url, _params, options) =>
      new Promise<ApiResponse<unknown>>((resolve) =>
        pending.set(url, { resolve, signal: options?.signal }),
      ),
  )
  const wrapper = await render({ target: 'first' })
  expect(wrapper.find('[role="status"]').text()).toContain('Loading search records')
  row(wrapper, '0.0').findComponent(QueryValue).vm.$emit('update:modelValue', 'Ready')
  await wrapper.find('button[aria-label="Search"]').trigger('click')
  expect(lastQuery(wrapper).terms).toEqual([{ column: 'name', termType: 'like', value: '%Ready%' }])
  await wrapper.setProps({ target: 'second' })
  expect(pending.get('/user/settings/first')?.signal?.aborted).toBe(true)
  pending
    .get('/user/settings/second')!
    .resolve(result([{ key: 'new', name: 'Second target', content: { version: 1, terms: [] } }]))
  await flushPromises()
  pending
    .get('/user/settings/first')!
    .resolve(result([{ id: 'stale', name: 'Old target', content: { terms: [] } }]))
  await flushPromises()
  const body = await openHistory(wrapper)
  expect(body.find('.query-history-menu').text()).toContain('Second target')
  expect(body.find('.query-history-menu').text()).not.toContain('Old target')
  vi.mocked(request.get).mockRejectedValueOnce(new Error('History unavailable'))
  await wrapper.setProps({ target: 'failed' })
  await flushPromises()
  expect(wrapper.find('.query-history-error').text()).toContain('History unavailable')
  await wrapper.find('button[aria-label="Search"]').trigger('click')
  expect(lastQuery(wrapper).terms).toEqual([{ column: 'name', termType: 'like', value: '%Ready%' }])
})

it('adds and removes groups and rows without removing the last entry or offering blocked operators', async () => {
  const wrapper = await render({
    fields: [
      { key: 'blocked', label: 'Blocked', operators: [] },
      { key: 'name', label: 'common.name', operators: ['eq'], first: true },
    ],
  })
  expect(
    row(wrapper, '0.0').find('.query-operator').findComponent(Select).props('options'),
  ).toEqual([{ value: 'eq', label: systemLocales.en.operator.eq }])
  expect(row(wrapper, '0.0').find('.query-field').findComponent(Select).props('options')).toEqual(
    expect.arrayContaining([expect.objectContaining({ value: 'blocked', disabled: true })]),
  )
  await wrapper.find('button[aria-label="More filters"]').trigger('click')
  await wrapper.find('.query-add-condition').trigger('click')
  expect(wrapper.findAll('.query-row')).toHaveLength(7)
  await wrapper.find('.query-add-group').trigger('click')
  expect(wrapper.findAll('[data-query-group]')).toHaveLength(3)
  await wrapper.find('button[aria-label="Remove group 3"]').trigger('click')
  await wrapper.find('button[aria-label="Remove group 2"]').trigger('click')
  expect(wrapper.find('button[aria-label="Remove group 1"]').attributes('disabled')).toBeDefined()
  while (wrapper.findAll('.query-row').length > 1)
    await wrapper.find('.query-remove-condition:not([disabled])').trigger('click')
  expect(wrapper.find('.query-remove-condition').attributes('disabled')).toBeDefined()
  expect(wrapper.find('.query-field').exists()).toBe(true)
})
