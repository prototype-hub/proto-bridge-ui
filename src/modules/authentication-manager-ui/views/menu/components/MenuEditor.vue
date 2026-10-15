<script setup lang="ts">
import { ref } from 'vue'
import {
  Drawer as ADrawer,
  Tabs as ATabs,
  TabPane as ATabPane,
  Form as AForm,
  Alert as AAlert,
  Card as ACard,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { ServerMenu, MenuButton } from '@/shared/auth/types'
import { authPermissions as p } from '@/modules/authentication-manager-ui/views/menu/permissions'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import MenuBasicFields from '@/modules/authentication-manager-ui/views/menu/components/MenuBasicFields.vue'
import MenuAdvanced from '@/modules/authentication-manager-ui/views/menu/components/MenuAdvanced.vue'
import MenuButtons from '@/modules/authentication-manager-ui/views/menu/components/MenuButtons.vue'
const model = defineModel<ServerMenu>({ required: true }),
  open = defineModel<boolean>('open', { required: true })
defineProps<{
  menus: ServerMenu[]
  parents: { value: string; label: string }[]
  creating: boolean
  busy: boolean
  error: string
}>()
const emit = defineEmits<{ save: []; buttons: [MenuButton[]] }>(),
  { t } = useI18n(),
  tab = ref('basic')
</script>
<template>
  <a-drawer
    :open="open"
    :title="t(creating ? 'common.add' : 'common.edit')"
    :width="980"
    :destroy-on-close="true"
    @close="open = false"
  >
    <a-alert v-if="error" type="error" :message="error" show-icon />
    <a-tabs v-model:active-key="tab"
      ><a-tab-pane key="basic" :tab="t('configuration.basic')"
        ><a-form name="menu-basic" :model="model" layout="vertical" @finish="emit('save')">
          <a-card :title="t('configuration.basic')" class="menu-section"
            ><menu-basic-fields v-model="model" :parents="parents"
          /></a-card>
          <a-card :title="t('configuration.permission')" class="menu-section"
            ><menu-advanced v-model:model="model" :menus="menus" /><permission-button
              :permission="creating ? p.menus.add : p.menus.edit"
              type="primary"
              html-type="submit"
              :loading="busy"
              >{{ t('common.save') }}</permission-button
            ></a-card
          >
        </a-form></a-tab-pane
      ><a-tab-pane key="buttons" :tab="t('configuration.buttons')"
        ><menu-buttons
          :buttons="model.buttons || []"
          :saved="!creating && !!model.id"
          :busy="busy"
          :state-error="error"
          @save="emit('buttons', $event)" /></a-tab-pane
    ></a-tabs>
  </a-drawer>
</template>
<style scoped>
.menu-section {
  margin-bottom: 24px;
}
</style>
