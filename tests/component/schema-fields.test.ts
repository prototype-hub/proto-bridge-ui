import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { h, nextTick, reactive } from 'vue'
import { Button, Form, Input, TreeSelect } from 'ant-design-vue'
import type { FormInstance } from 'ant-design-vue/es/form'
import { createI18n } from 'vue-i18n'
import SchemaFields from '@/modules/authentication-manager-ui/components/forms/SchemaFields.vue'
import FieldInput from '@/modules/authentication-manager-ui/components/forms/FieldInput.vue'
import PositionBasicFields from '@/modules/authentication-manager-ui/views/position/components/PositionBasicFields.vue'
import type { Field, FormContext } from '@/modules/authentication-manager-ui/types/forms'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import { setValue } from '@/modules/authentication-manager-ui/utils/model'
import { organizationEn, organizationZh } from '@/modules/authentication-manager-ui/locale-messages'
import { systemLocales } from '@/modules/authentication-manager-ui/locale-messages'
import { common } from '@/shared/i18n/common'
import { permissionKey } from '@/shared/auth/provider'

function createLocale() {
  return createI18n({
    legacy: false,
    locale: 'zh',
    messages: {
      zh: { common: common.zh, organization: organizationZh, system: systemLocales.zh },
      en: { common: common.en, organization: organizationEn, system: systemLocales.en },
    },
  })
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('SchemaFields form boundary', () => {
  it('validates visible fields and text limits without imposing numeric or selection limits', async () => {
    const locale = createLocale()
    const model = reactive<Model>({
      name: '',
      sortIndex: 100,
      roles: ['a', 'b'],
      advanced: false,
      details: { note: '' },
    })
    const fields: Field[] = [
      { key: 'name', label: 'system.name', required: true, max: 3 },
      { key: 'sortIndex', label: 'system.sortIndex', kind: 'number', required: true, max: 2 },
      {
        key: 'roles',
        label: 'system.roles',
        kind: 'multiple',
        required: true,
        max: 1,
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
      {
        key: 'details.note',
        label: 'system.description',
        kind: 'textarea',
        required: true,
        when: { key: 'advanced', values: [true] },
      },
    ]
    const wrapper = mount(Form, {
      props: { model },
      slots: { default: () => h(SchemaFields, { fields, model }) },
      global: { plugins: [locale] },
    })
    const form = wrapper.vm as FormInstance
    try {
      expect(wrapper.find('textarea').exists()).toBe(false)
      await expect(form.validateFields()).rejects.toMatchObject({
        errorFields: [{ name: ['name'], errors: [common.zh.required] }],
      })
      await wrapper.findComponent(Input).get('input').setValue('abc')
      await expect(form.validateFields()).resolves.toMatchObject({
        name: 'abc',
        sortIndex: 100,
        roles: ['a', 'b'],
      })

      // Imported or custom-control values must still be validated beyond the input's maxlength.
      model.name = 'abcd'
      await nextTick()
      await expect(form.validateFields()).rejects.toMatchObject({
        errorFields: [{ name: ['name'], errors: ['长度不能超过 3 个字符'] }],
      })
      await vi.waitFor(() => expect(wrapper.text()).toContain('长度不能超过 3 个字符'))
      locale.global.locale.value = 'en'
      await nextTick()
      await expect(form.validateFields()).rejects.toMatchObject({
        errorFields: [{ name: ['name'], errors: ['Use at most 3 characters'] }],
      })

      model.name = 'abc'
      model.advanced = true
      await nextTick()
      expect(wrapper.find('textarea').exists()).toBe(true)
      await expect(form.validateFields()).rejects.toMatchObject({
        errorFields: [{ name: ['details', 'note'], errors: [common.en.required] }],
      })
      await wrapper.get('textarea').setValue('Visible note')
      await expect(form.validateFields()).resolves.toMatchObject({
        details: { note: 'Visible note' },
      })
    } finally {
      wrapper.unmount()
    }
  })

  it('passes field/model/context to both slots and preserves the immutable default control', async () => {
    const locale = createLocale()
    const model = reactive<Model>({ id: 'saved', name: '', __editing: true })
    const context: FormContext = { roles: [{ value: 'r1', label: 'Role' }] }
    const fields: Field[] = [
      { key: 'id', label: 'system.id', immutable: true },
      { key: 'name', label: 'system.name', required: true },
    ]
    const extra = vi.fn()
    const wrapper = mount(Form, {
      props: { model },
      slots: {
        default: () =>
          h(
            SchemaFields,
            { fields, model, context },
            {
              field: (scope: { field: Field; model: Model; context: FormContext }) =>
                scope.field.key === 'name'
                  ? h(Input, {
                      'data-testid': 'custom-name',
                      value: String(scope.model.name),
                      'onUpdate:value': (value: string) =>
                        setValue(scope.model, scope.field.key, value),
                    })
                  : h(FieldInput, scope),
              'field-extra': (scope: { field: Field; model: Model; context: FormContext }) =>
                scope.field.key === 'name'
                  ? h(
                      Button,
                      { onClick: () => extra(scope), 'data-testid': 'field-extra' },
                      () => 'Add related',
                    )
                  : undefined,
            },
          ),
      },
      global: { plugins: [locale] },
    })
    try {
      expect(wrapper.findComponent(FieldInput).get('input').element.disabled).toBe(true)
      await wrapper.get('[data-testid="custom-name"]').setValue('Custom name')
      expect(model.name).toBe('Custom name')
      await wrapper.get('[data-testid="field-extra"]').trigger('click')
      expect(extra).toHaveBeenCalledWith({ field: fields[1], model, context })
      await expect((wrapper.vm as FormInstance).validateFields()).resolves.toMatchObject({
        name: 'Custom name',
      })
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps grouped position roles, related actions and the organization editing restriction', async () => {
    const locale = createLocale()
    const model = reactive<Model>({ name: 'Position', orgId: 'o1', roles: ['r1'] })
    const context: FormContext = {
      organizations: [{ value: 'o1', label: 'Organization' }],
      roles: [
        { value: 'r1', label: 'Grouped role' },
        { value: 'r2', label: 'Ungrouped role' },
      ],
      roleGroups: [
        { value: 'g1', label: 'Group', children: [{ value: 'r1', label: 'Grouped role' }] },
      ],
    }
    const wrapper = mount(PositionBasicFields, {
      props: { model, context },
      global: { plugins: [locale], provide: { [permissionKey as symbol]: { can: () => true } } },
    })
    try {
      const roleTree = wrapper
        .findAllComponents(TreeSelect)
        .find((control) => control.props('multiple'))
      expect(roleTree?.props('treeData')).toEqual([context.roleGroups[0], context.roles[1]])
      roleTree?.vm.$emit('update:value', ['r2'])
      expect(model.roles).toEqual(['r2'])
      await wrapper.get('button[aria-label="新增关联角色"]').trigger('click')
      await wrapper.get('button[aria-label="新增所属组织"]').trigger('click')
      expect(wrapper.emitted('related')).toEqual([['role'], ['org']])
      model.id = 'p1'
      model.__editing = true
      await flushPromises()
      const orgTree = wrapper
        .findAllComponents(TreeSelect)
        .find((control) => !control.props('multiple'))
      expect(orgTree?.props('disabled')).toBe(true)
      expect(wrapper.find('button[aria-label="新增所属组织"]').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })
})
