<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { TreeSelect as ATreeSelect } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import type { FormContext } from '@/modules/authentication-manager-ui/types/forms'
import { positionFields } from '@/modules/authentication-manager-ui/views/position/definition'
import { arrayValue, setValue } from '@/modules/authentication-manager-ui/utils/model'
import FieldInput from '@/modules/authentication-manager-ui/components/forms/FieldInput.vue'
import SchemaFields from '@/modules/authentication-manager-ui/components/forms/SchemaFields.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import { authPermissions } from '@/modules/authentication-manager-ui/views/role/permissions'
import { systemPermissions } from '@/modules/authentication-manager-ui/views/department/permissions'
const props = defineProps({
  model: { type: Object as PropType<Model>, required: true },
  context: { type: Object as PropType<FormContext>, required: true },
})
const emit = defineEmits<{ related: [kind: 'role' | 'org'] }>()
const { t } = useI18n()
const roles = computed(() => {
  const grouped = props.context.roleGroups || []
  const existing = new Set(
    grouped.flatMap((group) => group.children?.map((role) => String(role.value)) || []),
  )
  return [
    ...grouped,
    ...(props.context.roles || []).filter((role) => !existing.has(String(role.value))),
  ]
})
</script>
<template>
  <schema-fields :fields="positionFields" :model="model" :context="context">
    <template #field="{ field, model: fieldModel, context: fieldContext }">
      <a-tree-select
        v-if="field.key === 'roles'"
        :value="arrayValue(fieldModel.roles)"
        :tree-data="roles"
        :field-names="{ label: 'label', value: 'value', children: 'children' }"
        multiple
        allow-clear
        show-search
        tree-node-filter-prop="label"
        @update:value="(value) => setValue(fieldModel, 'roles', value)"
      /><field-input v-else :field="field" :model="fieldModel" :context="fieldContext" />
    </template>
    <template #field-extra="{ field, model: fieldModel }">
      <permission-button
        v-if="field.key === 'roles'"
        :permission="authPermissions.roles.add"
        :aria-label="t('common.add') + t('system.roles')"
        @click="emit('related', 'role')"
        ><plus-outlined /></permission-button
      ><permission-button
        v-if="field.key === 'orgId' && !fieldModel.id"
        :permission="systemPermissions.department.add"
        :aria-label="t('common.add') + t('system.orgId')"
        @click="emit('related', 'org')"
        ><plus-outlined
      /></permission-button>
    </template>
  </schema-fields>
</template>
