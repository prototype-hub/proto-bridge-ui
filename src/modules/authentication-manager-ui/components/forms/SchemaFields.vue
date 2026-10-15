<script setup lang="ts">
import { computed, type PropType } from 'vue'
import {
  FormItem as AFormItem,
  Row as ARow,
  Col as ACol,
  Divider as ADivider,
} from 'ant-design-vue'
import type { Rule } from 'ant-design-vue/es/form'
import { useI18n } from 'vue-i18n'
import type { Field, FormContext } from '@/modules/authentication-manager-ui/types/forms'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import { visibleField } from '@/modules/authentication-manager-ui/utils/model'
import FieldInput from '@/modules/authentication-manager-ui/components/forms/FieldInput.vue'
interface FieldSlotProps {
  field: Field
  model: Model
  context: FormContext
}
const props = defineProps({
  fields: { type: Array as PropType<Field[]>, required: true },
  model: { type: Object as PropType<Model>, required: true },
  context: { type: Object as PropType<FormContext>, default: () => ({}) },
})
defineSlots<{
  field?(props: FieldSlotProps): unknown
  'field-extra'?(props: FieldSlotProps): unknown
}>()
const { t } = useI18n()
function fieldRules(field: Field): Rule[] {
  const rules: Rule[] = field.required ? [{ required: true, message: t('common.required') }] : []
  // Field.max is a character limit; numeric values and selections retain their own semantics.
  if (field.max !== undefined && ['text', 'password', 'textarea'].includes(field.kind || 'text')) {
    rules.push({
      type: 'string',
      max: field.max,
      message: t('organization.maxLength', { max: field.max }),
    })
  }
  return rules
}
const groups = computed(() => {
  const map = new Map<string, Field[]>()
  for (const field of props.fields.filter((field) => visibleField(field, props.model))) {
    const key = field.section || ''
    map.set(key, [...(map.get(key) || []), field])
  }
  return [...map]
})
</script>
<template>
  <template v-for="[section, sectionFields] in groups" :key="section"
    ><a-divider v-if="section" orientation="left">{{ t(section) }}</a-divider
    ><a-row :gutter="24"
      ><a-col
        v-for="field in sectionFields"
        :key="field.key"
        :xs="24"
        :md="['textarea', 'json'].includes(field.kind || '') ? 24 : 12"
        ><a-form-item
          :name="field.key.split('.')"
          :label="t(field.label)"
          :rules="fieldRules(field)"
        >
          <div class="schema-field-control">
            <slot name="field" :field="field" :model="model" :context="context">
              <field-input :field="field" :model="model" :context="context" />
            </slot>
            <slot name="field-extra" :field="field" :model="model" :context="context" />
          </div> </a-form-item></a-col></a-row
  ></template>
</template>
<style scoped>
.schema-field-control {
  display: flex;
  align-items: start;
  gap: var(--space-2);
}
.schema-field-control > :first-child {
  flex: 1;
  min-width: 0;
}
</style>
