import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { Comment, defineComponent, h, reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import { FormItem, Input, Modal, Table, type TableColumnsType } from 'ant-design-vue'
import QueryTable from '@/shared/components/QueryTable.vue'
import FormModal from '@/shared/components/FormModal.vue'
import ProQuery from '@/shared/components/ProQuery.vue'
import { common } from '@/shared/i18n/common'
import type { Query } from '@/shared/api/types'

interface Row {
  id: string
  name: string
  meta?: { label: string }
  children?: Row[]
}
const columns: TableColumnsType<Row> = [{ title: 'Name', dataIndex: 'name' }]
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      common: common.en,
      system: {
        queryField: 'Query field',
        keyword: 'Keyword',
        reset: 'Reset',
        advancedQuery: 'Advanced',
      },
    },
  },
})
const global = { plugins: [i18n], stubs: { QueryHistory: true } }
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
afterAll(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('QueryTable composition', () => {
  it('keeps Ant default nested/custom cell rendering when no cell slot is supplied', () => {
    const wrapper = mount(QueryTable<Row>, {
      props: {
        rows: [{ id: 'one', name: 'Bridge', meta: { label: 'Nested' } }],
        columns: [
          ...columns,
          { title: 'Nested', dataIndex: ['meta', 'label'] },
          {
            title: 'Render',
            dataIndex: 'name',
            customRender: ({ text }) => h('strong', String(text).toUpperCase()),
          },
        ],
      },
      global,
    })
    expect(wrapper.find('tbody').text()).toContain('Bridge')
    expect(wrapper.find('tbody').text()).toContain('Nested')
    expect(wrapper.find('tbody strong').text()).toBe('BRIDGE')
    expect(wrapper.find('.pro-query').exists()).toBe(false)
    expect(wrapper.find('.query-table-actions').exists()).toBe(false)
    expect(wrapper.find('.query-table-filters').exists()).toBe(false)
    wrapper.unmount()
  })
  it('forwards selection, tree expansion and table layout while keeping controlled rows/pagination', async () => {
    const selection = vi.fn(),
      expansion = vi.fn()
    const rows: Row[] = [
      { id: 'parent', name: 'Parent', children: [{ id: 'child', name: 'Child' }] },
    ]
    const wrapper = mount(QueryTable<Row>, {
      props: {
        rows,
        columns,
        pagination: { current: 2, pageSize: 10, total: 40 },
        tableProps: {
          rowSelection: { onChange: selection },
          expandedRowKeys: ['parent'],
          onExpandedRowsChange: expansion,
          scroll: { x: 1330 },
          tableLayout: 'fixed',
        },
      },
      global,
    })
    const table = wrapper.findComponent(Table)
    expect(table.props('dataSource')).toEqual(rows)
    expect(table.props('scroll')).toEqual({ x: 1330 })
    expect(table.props('tableLayout')).toBe('fixed')
    expect(table.props('pagination')).toMatchObject({ current: 2, pageSize: 10 })
    await wrapper.find('tbody input[type="checkbox"]').setValue(true)
    expect(selection).toHaveBeenCalled()
    await wrapper.find('.ant-table-row-expand-icon').trigger('click')
    expect(expansion).toHaveBeenCalledWith([])
    table.vm.$emit('change', { current: 3, pageSize: 10 })
    expect(wrapper.emitted('page')?.[0]).toEqual([3, 10])
    wrapper.unmount()
  })
  it('combines query/toolbar/filter/cell slots and exposes refresh and retry independently', async () => {
    const wrapper = mount(QueryTable<Row>, {
      props: {
        fields: [{ key: 'name', label: 'common.name' }],
        target: 'example',
        rows: [{ id: 'one', name: 'Bridge' }],
        columns,
        panel: false,
      },
      slots: {
        toolbar: () => h('button', 'Create'),
        filters: () => h('span', 'Active filter'),
        cell: ({ record }: { record: Row }) => h('button', `Inspect ${record.name}`),
      },
      global,
    })
    expect(wrapper.classes()).not.toContain('panel')
    expect(wrapper.find('.query-table-actions').text()).toBe('Create')
    expect(wrapper.find('.query-table-filters').text()).toBe('Active filter')
    expect(wrapper.find('tbody button').text()).toBe('Inspect Bridge')
    const query: Query = {
      terms: [{ column: 'name', value: '%Bridge%' }],
      sorts: [{ name: 'name', order: 'asc' }],
    }
    wrapper.findComponent(ProQuery).vm.$emit('search', query)
    expect(wrapper.emitted('search')?.[0]).toEqual([query])
    await wrapper.find('button[aria-label="Refresh"]').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    await wrapper.setProps({ loading: true, actionError: 'Save failed' })
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Save failed')
    await wrapper.setProps({ loading: false, error: 'List failed' })
    const retry = wrapper.findAll('button').find((button) => button.text() === 'Retry')!
    await retry.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    wrapper.unmount()
  })
  it('does not reserve layout space for conditional slots that render no content', () => {
    const wrapper = mount(QueryTable<Row>, {
      props: { rows: [], columns },
      slots: { toolbar: () => h(Comment), filters: () => [] },
      global,
    })
    expect(wrapper.find('.query-table-actions').exists()).toBe(false)
    expect(wrapper.find('.query-table-filters').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('FormModal form ownership', () => {
  it('uses distinct form IDs for simultaneous dialogs and submits only validated caller models', async () => {
    const first = reactive({ name: '' }),
      second = reactive({ name: 'Second' })
    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(
              'div',
              [first, second].map((model, index) =>
                h(
                  FormModal<{ name: string }>,
                  { open: true, title: `Dialog ${index}`, model, formName: 'example' },
                  {
                    default: () =>
                      h(
                        FormItem,
                        {
                          name: 'name',
                          label: `Name ${index}`,
                          rules: [{ required: true, message: 'Required name' }],
                        },
                        () =>
                          h(Input, {
                            value: model.name,
                            'onUpdate:value': (value: string) => (model.name = value),
                          }),
                      ),
                  },
                ),
              ),
            )
        },
      }),
      { global, attachTo: document.body },
    )
    await flushPromises()
    const body = new DOMWrapper(document.body)
    const inputs = body.findAll('input')
    expect(inputs).toHaveLength(2)
    expect(inputs[0]?.attributes('id')).not.toBe(inputs[1]?.attributes('id'))
    const labels = body.findAll('label')
    expect(labels[0]?.attributes('for')).toBe(inputs[0]?.attributes('id'))
    expect(labels[1]?.attributes('for')).toBe(inputs[1]?.attributes('id'))
    const dialogs = wrapper.findAllComponents({ name: 'FormModal' })
    await body.findAll('form')[0]!.trigger('submit')
    await flushPromises()
    expect(dialogs[0]?.emitted('submit')).toBeUndefined()
    await inputs[0]!.setValue('First')
    await body.findAll('form')[0]!.trigger('submit')
    await flushPromises()
    expect(dialogs[0]?.emitted('submit')).toEqual([[]])
    expect(first).toEqual({ name: 'First' })
    const cancel = body
      .findAll('.ant-modal')[1]!
      .findAll('button')
      .find((button) => button.text() === 'Cancel')!
    await cancel.trigger('click')
    expect(dialogs[1]?.emitted('cancel')).toEqual([[]])
    expect(dialogs[1]?.emitted('update:open')).toEqual([[false]])
    expect(dialogs[0]?.findComponent(Modal).props()).toMatchObject({
      maskClosable: false,
      destroyOnClose: true,
      width: 800,
    })
    wrapper.unmount()
  })
  it('lets the caller replace the footer and preserves error/busy feedback', async () => {
    const wrapper = mount(FormModal, {
      props: {
        open: true,
        title: 'Custom',
        model: { name: 'Typed interface' },
        busy: true,
        error: 'Submission failed',
      },
      slots: {
        default: () => h(FormItem, { name: 'name', label: 'Name' }, () => h(Input)),
        footer: () => h('button', { type: 'submit' }, 'Apply'),
      },
      global,
    })
    await flushPromises()
    const body = new DOMWrapper(document.body)
    expect(body.text()).toContain('Submission failed')
    expect(body.findAll('button').some((button) => button.text() === 'Save')).toBe(false)
    expect(body.find('form button[type="submit"]').text()).toBe('Apply')
    wrapper.unmount()
    const defaultFooter = mount(FormModal, {
      props: { open: true, title: 'Default', model: {}, busy: true },
      global,
    })
    await flushPromises()
    expect(body.find('button.ant-btn-primary').attributes('disabled')).toBeDefined()
    expect(body.find('button.ant-btn-primary').classes()).toContain('ant-btn-loading')
    defaultFooter.unmount()
  })
})
