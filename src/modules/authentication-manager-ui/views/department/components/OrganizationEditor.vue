<script setup lang="ts">
import { ref, watch, computed, type PropType } from 'vue'
import {
  FormItem as AFormItem,
  TreeSelect as ATreeSelect,
  Input as AInput,
  InputNumber as AInputNumber,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { Model, SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import {
  parentOptions,
  nextOrganizationOrder,
} from '@/modules/authentication-manager-ui/utils/organization'
import { stringValue, numberValue } from '@/modules/authentication-manager-ui/utils/model'
import FormModal from '@/shared/components/FormModal.vue'
const props = defineProps({
  modelValue: { type: Object as PropType<Model | undefined>, default: undefined },
  tree: { type: Array as PropType<SystemRecord[]>, required: true },
  busy: Boolean,
  error: { type: String, default: '' },
})
const emit = defineEmits<{ 'update:modelValue': [value: undefined]; save: [value: Model] }>()
const { t } = useI18n()
const draft = ref<Model>({})
const options = computed(() => parentOptions(props.tree, stringValue(draft.value.id)))
watch(
  () => props.modelValue,
  (value) => {
    draft.value = { ...value }
  },
  { immediate: true },
)
function parentChanged(value: unknown) {
  draft.value.parentId = value
  draft.value.sortIndex = nextOrganizationOrder(props.tree, stringValue(value))
}
</script>
<template>
  <form-modal
    :open="!!modelValue"
    :title="t(modelValue?.id ? 'common.edit' : 'common.add')"
    :model="draft"
    :busy="busy"
    :error="error"
    :width="520"
    form-name="organization"
    @cancel="emit('update:modelValue', undefined)"
    @submit="emit('save', draft)"
  >
    <a-form-item name="parentId" :label="t('organization.parent')"
      ><a-tree-select
        :value="stringValue(draft.parentId)"
        :tree-data="options"
        :field-names="{ label: 'label', value: 'value', children: 'children' }"
        allow-clear
        show-search
        tree-node-filter-prop="label"
        @update:value="parentChanged"
    /></a-form-item>
    <a-form-item
      name="name"
      :label="t('common.name')"
      :rules="[
        { required: true, message: t('common.required') },
        { max: 64, message: t('organization.maxLength', { max: 64 }) },
      ]"
      ><a-input
        :value="stringValue(draft.name)"
        :maxlength="64"
        @update:value="(value) => (draft.name = value)"
    /></a-form-item>
    <a-form-item
      name="sortIndex"
      :label="t('system.sortIndex')"
      :rules="[{ required: true, message: t('common.required') }]"
      ><a-input-number
        :value="numberValue(draft.sortIndex)"
        :min="1"
        :precision="0"
        style="width: 100%"
        @update:value="(value) => (draft.sortIndex = value)"
    /></a-form-item>
  </form-modal>
</template>
