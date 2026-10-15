<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Checkbox as ACheckbox,
  CheckboxGroup as ACheckboxGroup,
  Input as AInput,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { exportPermission_api } from '@/modules/authentication-manager-ui/api/permission/permission'
import { recordsOf, arrayValue, stringValue } from '@/modules/authentication-manager-ui/utils/model'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import type { ResourcePermission } from '@/shared/auth/types'
import { useResource } from '@/shared/composables/useResource'
import LoadState from '@/shared/components/LoadState.vue'
const model = defineModel<ResourcePermission[]>({ default: () => [] })
defineProps<{ disabled?: boolean }>()
const { t } = useI18n(),
  keyword = ref('')
const resource = useResource(
  async () => recordsOf(await exportPermission_api({ paging: false })),
  [],
)
const rows = computed(() =>
  resource.data.value.filter((row) =>
    String(row.i18nName || row.name)
      .toLowerCase()
      .includes(keyword.value.toLowerCase()),
  ),
)
function options(row: SystemRecord) {
  return recordsOf(row.actions).map((action) => ({
    label: stringValue(action.i18nName || action.name),
    value: stringValue(action.action),
  }))
}
function selected(id: string) {
  return model.value.find((row) => row.permission === id)?.actions || []
}
function update(id: string, values: unknown[]) {
  model.value = [
    ...model.value.filter((row) => row.permission !== id),
    ...(values.length ? [{ permission: id, actions: arrayValue(values).map(String) }] : []),
  ]
}
onMounted(resource.load)
</script>
<template>
  <div class="permission-picker">
    <a-input
      v-model:value="keyword"
      :placeholder="t('configuration.permissionSearch')"
      allow-clear
      :disabled="disabled"
    />
    <load-state
      :loading="resource.loading.value"
      :error="resource.error.value"
      @retry="resource.load"
    >
      <div class="permissions">
        <div class="permission-row head">
          <span>{{ t('configuration.permissionResource') }}</span
          ><span>{{ t('configuration.permissionActions') }}</span>
        </div>
        <div v-for="row in rows" :key="row.id" class="permission-row">
          <a-checkbox
            :disabled="disabled"
            :checked="!!options(row).length && selected(row.id).length === options(row).length"
            :indeterminate="
              selected(row.id).length > 0 && selected(row.id).length < options(row).length
            "
            @update:checked="
              update(row.id, $event ? options(row).map((option) => option.value) : [])
            "
            >{{ row.i18nName || row.name }}</a-checkbox
          ><a-checkbox-group
            :disabled="disabled"
            :value="selected(row.id)"
            :options="options(row)"
            @update:value="update(row.id, $event)"
          />
        </div>
      </div>
    </load-state>
  </div>
</template>
<style scoped>
.permission-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.permissions {
  max-height: 350px;
  overflow: auto;
  border: 1px solid #f0f0f0;
}
.permission-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) 3fr;
  border-bottom: 1px solid #f0f0f0;
  padding: 12px;
  gap: 16px;
}
.head {
  background: #fafafa;
  font-weight: 500;
}
@media (width <= 640px) {
  .permission-row {
    grid-template-columns: 1fr;
  }
}
</style>
