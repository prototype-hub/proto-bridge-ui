import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import {
  Input,
  InputNumber,
  RangePicker,
  Select,
  TimePicker,
  TimeRangePicker,
  TreeSelect,
} from 'ant-design-vue'
import dayjs from 'dayjs'
import QueryValue from '@/shared/components/QueryValue.vue'
import { common } from '@/shared/i18n/common'
import type { QueryOption, QueryOptionContext } from '@/shared/api/types'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: { common: common.en, system: { keyword: 'Value', rangeStart: 'Start', rangeEnd: 'End' } },
  },
})
const global = { plugins: [i18n] }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() })),
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    },
  )
  const style = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => style(element))
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})
afterAll(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('query value option and native-control contracts', () => {
  it('resolves a selected zero label missing from a remote result and preserves its numeric value', async () => {
    const loadOptions = vi.fn(async (_context: QueryOptionContext) => [
      { value: 1, label: 'Enabled' },
    ])
    const resolveOptions = vi.fn(async (_values: (string | number)[], _signal: AbortSignal) => [
      { value: 0, label: 'Disabled' },
    ])
    const wrapper = mount(QueryValue, {
      props: {
        field: { key: 'status', label: 'Status', type: 'select', loadOptions, resolveOptions },
        modelValue: 0,
        operator: 'eq',
        ariaLabel: 'Status value',
      },
      global,
    })
    await flushPromises()
    expect(loadOptions.mock.calls[0][0].selected).toEqual([0])
    expect(resolveOptions.mock.calls[0][0]).toEqual([0])
    expect(wrapper.find('.ant-select-selection-item').text()).toBe('Disabled')
    const label = wrapper.get('label')
    expect(label.text()).toBe('Status value')
    expect(wrapper.find(`input[id="${label.attributes('for')}"]`).exists()).toBe(true)
    wrapper.findComponent(Select).vm.$emit('update:value', 0)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([0])
    wrapper.unmount()
  })

  it('cancels stale remote searches immediately and never applies a late result to a different field', async () => {
    const old = deferred<QueryOption[]>(),
      latest = deferred<QueryOption[]>()
    const contexts: QueryOptionContext[] = []
    const loadOptions = vi.fn((context: QueryOptionContext) => {
      contexts.push(context)
      return context.search === 'old'
        ? old.promise
        : context.search === 'new'
          ? latest.promise
          : Promise.resolve([])
    })
    const wrapper = mount(QueryValue, {
      props: {
        field: { key: 'role', label: 'Role', type: 'select', loadOptions },
        modelValue: '',
        operator: 'eq',
      },
      global,
    })
    await flushPromises()
    vi.useFakeTimers()
    wrapper.findComponent(Select).vm.$emit('search', 'old')
    await vi.advanceTimersByTimeAsync(150)
    const oldContext = contexts.find((context) => context.search === 'old')!
    wrapper.findComponent(Select).vm.$emit('search', 'new')
    expect(oldContext.signal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(150)
    latest.resolve([{ label: 'Current', value: 'current' }])
    await flushPromises()
    old.resolve([{ label: 'Stale', value: 'stale' }])
    await flushPromises()
    expect(wrapper.findComponent(Select).props('options')).toEqual([
      { label: 'Current', value: 'current' },
    ])
    await wrapper.setProps({
      field: {
        key: 'other',
        label: 'Other',
        type: 'select',
        options: [{ label: 'Other', value: 0 }],
      },
      modelValue: 0,
    })
    await flushPromises()
    expect(wrapper.findComponent(Select).props('options')).toEqual([{ label: 'Other', value: 0 }])
    expect(wrapper.find('.ant-select-selection-item').text()).toBe('Other')
    wrapper.unmount()
  })

  it('cancels selected-label lookup when selection changes and on unmount, even when providers ignore abort', async () => {
    const first = deferred<QueryOption[]>(),
      second = deferred<QueryOption[]>(),
      last = deferred<QueryOption[]>()
    const signals: AbortSignal[] = []
    const resolveOptions = vi.fn((values: (string | number)[], signal: AbortSignal) => {
      signals.push(signal)
      return values[0] === 'old' ? first.promise : values[0] === 0 ? second.promise : last.promise
    })
    const wrapper = mount(QueryValue, {
      props: {
        field: { key: 'role', label: 'Role', type: 'select', resolveOptions },
        modelValue: 'old',
        operator: 'eq',
      },
      global,
    })
    await flushPromises()
    await wrapper.setProps({ modelValue: 0 })
    await flushPromises()
    expect(signals[0].aborted).toBe(true)
    second.resolve([{ label: 'Zero', value: 0 }])
    await flushPromises()
    first.resolve([{ label: 'Late old', value: 'old' }])
    await flushPromises()
    expect(wrapper.find('.ant-select-selection-item').text()).toBe('Zero')
    expect(wrapper.findComponent(Select).props('options')).toEqual([{ label: 'Zero', value: 0 }])
    await wrapper.setProps({ modelValue: 'unmounted' })
    await flushPromises()
    wrapper.unmount()
    expect(signals.at(-1)?.aborted).toBe(true)
    last.resolve([{ label: 'Late disposed', value: 'unmounted' }])
    await flushPromises()
  })

  it('shows option failures and retries rather than presenting a failed request as an empty list', async () => {
    const loadOptions = vi
      .fn()
      .mockRejectedValueOnce(new Error('Options unavailable'))
      .mockResolvedValue([{ value: 0, label: 'Restored' }])
    const wrapper = mount(QueryValue, {
      props: {
        field: { key: 'status', label: 'Status', type: 'select', loadOptions },
        modelValue: 0,
        operator: 'eq',
      },
      global,
    })
    await flushPromises()
    expect(wrapper.find('.ant-alert-message').text()).toBe('Options unavailable')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.ant-alert').exists()).toBe(false)
    expect(wrapper.find('.ant-select-selection-item').text()).toBe('Restored')
    expect(loadOptions).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('renders hierarchical options, millisecond date ranges, formatted time and numeric ranges with accessible controls', async () => {
    const hierarchy: QueryOption[] = [
      { label: 'Parent', value: 'parent', children: [{ label: 'Zero child', value: 0 }] },
    ]
    const wrapper = mount(QueryValue, {
      props: {
        field: { key: 'org', label: 'Organization', type: 'treeSelect', options: hierarchy },
        modelValue: 0,
        operator: 'eq',
        ariaLabel: 'Condition value',
      },
      global,
    })
    await flushPromises()
    expect(wrapper.findComponent(TreeSelect).props('treeData')).toEqual(hierarchy)
    expect(wrapper.find('.ant-select-selection-item').text()).toBe('Zero child')
    expect(wrapper.find(`input[id="${wrapper.get('label').attributes('for')}"]`).exists()).toBe(
      true,
    )
    await wrapper.setProps({
      field: { key: 'createdAt', label: 'Created', type: 'date' },
      modelValue: [0, 1000],
      operator: 'btw',
    })
    const picker = wrapper.findComponent(RangePicker)
    expect(picker.props('value')?.[0]?.valueOf()).toBe(0)
    picker.vm.$emit('update:value', [dayjs(0), dayjs(1000)])
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[0, 1000]])
    await wrapper.setProps({
      field: { key: 'time', label: 'Time', type: 'time' },
      modelValue: '00:00:00',
      operator: 'eq',
    })
    wrapper.findComponent(TimePicker).vm.$emit('update:value', dayjs('1970-01-01 01:02:03'))
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['01:02:03'])
    wrapper.findComponent(TimePicker).vm.$emit('update:value', '05:06:07')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['05:06:07'])
    for (const value of [null, '25:00:00', dayjs('invalid')]) {
      wrapper.findComponent(TimePicker).vm.$emit('update:value', value)
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    }
    await wrapper.setProps({ operator: 'btw', modelValue: ['00:00:00', '01:00:00'] })
    wrapper
      .findComponent(TimeRangePicker)
      .vm.$emit('update:value', [dayjs('1970-01-01 00:00:00'), '01:02:03'])
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['00:00:00', '01:02:03']])
    for (const value of [null, [dayjs('1970-01-01 00:00:00'), null], ['25:00:00', '01:00:00']]) {
      wrapper.findComponent(TimeRangePicker).vm.$emit('update:value', value)
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[]])
    }
    await wrapper.setProps({
      field: { key: 'ordinal', label: 'Order', type: 'number' },
      modelValue: [0, 2],
      operator: 'btw',
    })
    const numbers = wrapper.findAllComponents(InputNumber)
    expect(numbers[0].props('value')).toBe(0)
    const startLabel = wrapper
      .findAll('label')
      .find((label) => label.text() === 'Condition value Start')!
    expect(wrapper.find(`input[id="${startLabel.attributes('for')}"]`).exists()).toBe(true)
    numbers[1].vm.$emit('update:value', 3)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[0, 3]])
    await wrapper.setProps({
      field: { key: 'name', label: 'Name' },
      modelValue: 'stale',
      operator: 'isnull',
    })
    expect(wrapper.findComponent(Input).props('disabled')).toBe(true)
    wrapper.unmount()
  })
})
