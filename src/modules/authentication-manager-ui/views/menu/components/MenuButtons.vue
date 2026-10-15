<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Button as AButton,
  Space as ASpace,
  FormItem as AFormItem,
  Input as AInput,
  Textarea as ATextarea,
  AutoComplete as AAutoComplete,
  Alert as AAlert,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { EditOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import type { MenuButton } from '@/shared/auth/types'
import { authPermissions as p } from '@/modules/authentication-manager-ui/views/menu/permissions'
import DataTable from '@/shared/components/DataTable.vue'
import FormModal from '@/shared/components/FormModal.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import PermissionPicker from '@/modules/authentication-manager-ui/views/menu/components/PermissionPicker.vue'
const props = defineProps<{
  buttons: MenuButton[]
  saved: boolean
  busy: boolean
  stateError?: string
}>()
const emit = defineEmits<{ save: [buttons: MenuButton[]] }>()
const { t } = useI18n(),
  open = ref(false),
  mode = ref<'add' | 'edit' | 'view'>('add'),
  draft = ref<MenuButton>({ id: '', name: '', permissions: [], description: '' }),
  error = ref('')
const columns = computed(() => [
  { title: t('auth.buttonId'), dataIndex: 'id' },
  { title: t('auth.buttonName'), dataIndex: 'name' },
  { title: t('configuration.description'), dataIndex: 'description' },
  { title: t('common.actions'), key: 'actions', width: 144 },
])
function edit(value?: MenuButton, view = false) {
  mode.value = view ? 'view' : value ? 'edit' : 'add'
  draft.value = value
    ? (JSON.parse(JSON.stringify(value)) as MenuButton)
    : { id: '', name: '', permissions: [], description: '' }
  error.value = ''
  open.value = true
}
function save() {
  if (mode.value === 'view') {
    open.value = false
    return
  }
  if (mode.value === 'add' && props.buttons.some((button) => button.id === draft.value.id)) {
    error.value = t('configuration.duplicateButton')
    return
  }
  emit('save', [...props.buttons.filter((button) => button.id !== draft.value.id), draft.value])
}
watch(
  () => props.buttons,
  () => {
    open.value = false
  },
)
</script>
<template>
  <a-alert v-if="!saved" type="info" :message="t('configuration.saveMenuFirst')" />
  <div class="toolbar">
    <permission-button
      :permission="p.menus.edit"
      type="primary"
      :disabled="!saved || busy"
      @click="edit()"
      >{{ t('common.add') }}</permission-button
    >
  </div>
  <data-table :rows="buttons" :columns="columns"
    ><template #cell="{ column, record }"
      ><a-space v-if="column.key === 'actions'" :size="8">
        <action-button
          :label="t('common.edit')"
          :icon="EditOutlined"
          :permission="p.menus.edit"
          :disabled="busy"
          @action="edit(record)"
        />
        <action-button
          :label="t('common.detail')"
          :icon="EyeOutlined"
          @action="edit(record, true)"
        />
        <action-button
          :label="t('common.delete')"
          :icon="DeleteOutlined"
          :permission="p.menus.edit"
          danger
          :disabled="busy"
          :confirm="t('common.confirmDelete')"
          @action="
            emit(
              'save',
              buttons.filter((button) => button.id !== record.id),
            )
          "
        /> </a-space
      ><template v-else-if="column.dataIndex === 'name'">{{
        record.i18nName || record.name
      }}</template
      ><template v-else>{{ record[column.dataIndex as keyof MenuButton] }}</template></template
    ></data-table
  >
  <form-modal
    v-model:open="open"
    :title="t(mode === 'view' ? 'common.detail' : mode === 'edit' ? 'common.edit' : 'common.add')"
    :width="700"
    :model="draft"
    :busy="busy"
    :error="error || stateError"
    form-name="menu-button"
    @submit="save"
  >
    <a-form-item
      name="id"
      :label="t('auth.buttonId')"
      :rules="[{ required: true, whitespace: true, max: 64, message: t('common.required') }]"
      ><a-auto-complete
        v-model:value="draft.id"
        :disabled="mode !== 'add'"
        :options="['add', 'delete', 'update', 'view'].map((value) => ({ value }))"
        :maxlength="64"
    /></a-form-item>
    <a-form-item
      name="name"
      :label="t('auth.buttonName')"
      :rules="[{ required: true, whitespace: true, max: 64, message: t('common.required') }]"
      ><a-input v-model:value="draft.name" :disabled="mode === 'view'" :maxlength="64"
    /></a-form-item>
    <a-form-item
      name="permissions"
      :label="t('configuration.permission')"
      :rules="[
        { required: true, type: 'array', min: 1, message: t('configuration.selectPermission') },
      ]"
      ><permission-picker v-model="draft.permissions" :disabled="mode === 'view'"
    /></a-form-item>
    <a-form-item name="description" :label="t('configuration.description')"
      ><a-textarea v-model:value="draft.description" :disabled="mode === 'view'" :rows="3"
    /></a-form-item>
    <template v-if="mode === 'view'" #footer
      ><a-button type="primary" @click="open = false">{{ t('common.close') }}</a-button></template
    >
  </form-modal>
</template>
