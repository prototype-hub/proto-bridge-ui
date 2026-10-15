<script setup lang="ts">
import { computed } from 'vue'
import {
  FormItem as AFormItem,
  Input as AInput,
  Table as ATable,
  Button as AButton,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { DeleteOutlined } from '@ant-design/icons-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import type { PermissionResource } from '@/modules/authentication-manager-ui/types/permission'
import FormModal from '@/shared/components/FormModal.vue'
const model = defineModel<PermissionResource>()
defineProps({ editing: Boolean, busy: Boolean, error: { type: String, default: '' } })
const emit = defineEmits<{ save: [] }>()
const { t } = useI18n()
const columns = computed(() => [
  { title: '#', key: 'index', width: 60 },
  { title: t('identity.actionCode'), key: 'action', width: 220 },
  { title: t('common.name'), key: 'name' },
  { title: t('identity.actionDescription'), key: 'describe' },
  { title: t('common.actions'), key: 'actions', width: 64 },
])
</script>
<template>
  <form-modal
    v-if="model"
    :open="!!model"
    :title="t(editing ? 'common.edit' : 'common.add')"
    :width="1000"
    :model="model"
    :busy="busy"
    :error="error"
    form-name="permission-resource"
    @cancel="model = undefined"
    @submit="emit('save')"
    ><a-form-item
      name="id"
      :label="t('common.id')"
      :rules="[{ required: true, whitespace: true, max: 64, message: t('common.required') }]"
      ><a-input v-model:value="model.id" :disabled="editing" :maxlength="64" /></a-form-item
    ><a-form-item
      name="name"
      :label="t('common.name')"
      :rules="[{ required: true, whitespace: true, max: 64, message: t('common.required') }]"
      ><a-input v-model:value="model.name" :maxlength="64" /></a-form-item
    ><a-table
      :columns="columns"
      :data-source="model.actions"
      :pagination="false"
      :scroll="{ x: 700, y: 300 }"
      ><template #bodyCell="{ column, record, index }"
        ><template v-if="column.key === 'index'">{{ index + 1 }}</template
        ><action-button
          v-else-if="column.key === 'actions'"
          :label="t('common.delete')"
          :icon="DeleteOutlined"
          danger
          @action="model.actions.splice(index, 1)" /><a-form-item
          v-else
          :name="['actions', index, String(column.key)]"
          :rules="[
            {
              required: column.key !== 'describe',
              whitespace: true,
              max: 64,
              message: t('common.invalid'),
            },
          ]"
          style="margin-bottom: 0"
          ><a-input
            v-model:value="record[String(column.key)]"
            :maxlength="64" /></a-form-item></template></a-table
    ><a-button
      type="dashed"
      block
      style="margin: 8px 0 24px"
      @click="model.actions.push({ action: '', name: '', describe: '' })"
      >{{ t('identity.addAction') }}</a-button
    >
  </form-modal>
</template>
