<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  FormItem as AFormItem,
  Select as ASelect,
  RadioGroup as ARadioGroup,
  Radio as ARadio,
  TreeSelect as ATreeSelect,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { ServerMenu } from '@/shared/auth/types'
import { getAssetsType } from '@/modules/authentication-manager-ui/api/menu/menu'
import { recordsOf } from '@/modules/authentication-manager-ui/utils/model'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import PermissionPicker from '@/modules/authentication-manager-ui/views/menu/components/PermissionPicker.vue'
import { menuDisplayName } from '@/shared/auth/menu-display'
const model = defineModel<ServerMenu>('model', { required: true })
const props = defineProps<{ menus: ServerMenu[] }>()
const { t, locale } = useI18n(),
  assets = ref<SystemRecord[]>([])
const menuOptions = computed(() => {
  const labels = (rows: ServerMenu[]): ServerMenu[] =>
    rows.map((row) => ({
      ...row,
      name: menuDisplayName(row, locale.value),
      children: labels(row.children || []),
    }))
  return labels(props.menus.filter((row) => row.id !== model.value.id))
})
onMounted(async () => {
  assets.value = recordsOf(await getAssetsType())
})
</script>
<template>
  <a-form-item name="accessSupport" :label="t('configuration.dataAccess')">
    <a-radio-group v-model:value="model.accessSupport"
      ><a-radio
        v-for="value in ['unsupported', 'support', 'indirect']"
        :key="value"
        :value="value"
        >{{ t(`configuration.${value}`) }}</a-radio
      ></a-radio-group
    >
  </a-form-item>
  <a-form-item
    v-if="model.accessSupport === 'support'"
    name="assetType"
    :label="t('system.assetType')"
    :rules="[{ required: true, message: t('common.required') }]"
    ><a-select
      v-model:value="model.assetType"
      :options="assets.map((row) => ({ value: row.id, label: String(row.i18nName || row.name) }))"
      show-search
      option-filter-prop="label"
  /></a-form-item>
  <a-form-item
    v-if="model.accessSupport === 'indirect'"
    name="indirectMenus"
    :label="t('system.indirectMenus')"
    :rules="[{ required: true, type: 'array', min: 1, message: t('common.required') }]"
    ><a-tree-select
      v-model:value="model.indirectMenus"
      multiple
      :tree-data="menuOptions"
      :field-names="{ children: 'children', label: 'name', value: 'id' }"
      show-search
      tree-node-filter-prop="name"
  /></a-form-item>
  <a-form-item name="permissions" :label="t('configuration.permission')"
    ><permission-picker v-model="model.permissions"
  /></a-form-item>
</template>
