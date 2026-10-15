<script setup lang="ts">
import { systemPermissions } from '@/modules/authentication-manager-ui/views/menu/permissions'
import { ref, type PropType } from 'vue'
import {
  Modal as AModal,
  Textarea as ATextarea,
  Space as ASpace,
  Alert as AAlert,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { ServerMenu } from '@/shared/auth/types'
import { updateMenus, saveInit } from '@/modules/authentication-manager-ui/api/menu/initHome'
import { request } from '@/shared/api/client'
import { downloadJson } from '@/modules/authentication-manager-ui/utils/files'
import { useTask } from '@/shared/composables/useTask'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import { saved } from '@/shared/utils/feedback'
import { useSession } from '@/app/stores/session'
import MenuSettings from '@/modules/authentication-manager-ui/views/menu/components/MenuSettings.vue'
import { useRoute } from 'vue-router'
import { watch } from 'vue'
defineProps({ menus: { type: Array as PropType<ServerMenu[]>, required: true } })
const emit = defineEmits<{ refresh: [] }>(),
  { t } = useI18n(),
  task = useTask(),
  open = ref(false),
  data = ref('[]')
const settingsOpen = ref(false),
  session = useSession(),
  route = useRoute()
watch(
  () => route.path,
  (path) => {
    if (path.endsWith('/Setting')) settingsOpen.value = true
  },
  { immediate: true },
)
async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  await task.run(async () => {
    const value: unknown = JSON.parse(await file.text())
    if (!Array.isArray(value)) throw new Error(t('common.invalid'))
    await request.patch('/menu', value)
    saved()
    emit('refresh')
  })
}
async function initialize() {
  await task.run(async () => {
    const value: unknown = JSON.parse(data.value)
    if (!Array.isArray(value)) throw new Error(t('common.invalid'))
    await updateMenus(value)
    await saveInit()
    saved()
    open.value = false
    emit('refresh')
  })
}
</script>
<template>
  <div class="toolbar">
    <a-space
      ><permission-button
        v-if="session.user?.username === 'admin'"
        :permission="systemPermissions.menu.update"
        @click="settingsOpen = true"
        >{{ t('configuration.menuSettings') }}</permission-button
      ><permission-button
        :permission="systemPermissions.menu['export']"
        @click="downloadJson(menus, 'menus.json')"
        >{{ t('system.export') }}</permission-button
      ><permission-button :permission="systemPermissions.menu['import']"
        ><label class="upload-label"
          >{{ t('system.import')
          }}<input type="file" accept=".json" @change="importFile" /></label></permission-button
      ><permission-button
        :permission="systemPermissions.menu['update']"
        @click="
          () => {
            data = JSON.stringify(menus, null, 2)
            open = true
          }
        "
        >{{ t('system.initializeMenus') }}</permission-button
      ></a-space
    >
  </div>
  <a-alert v-if="task.error.value" type="error" :message="task.error.value" /><a-modal
    v-model:open="open"
    :title="t('system.initializeMenus')"
    :width="800"
    :confirm-loading="task.busy.value"
    @ok="initialize"
    ><a-alert type="warning" :message="t('system.initializeWarning')" /><a-textarea
      v-model:value="data"
      :rows="15"
  /></a-modal>
  <menu-settings v-model="settingsOpen" @refresh="emit('refresh')" />
</template>
<style scoped>
.upload-label {
  position: relative;
}
.upload-label input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}
</style>
