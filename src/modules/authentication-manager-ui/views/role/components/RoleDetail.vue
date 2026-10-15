<script setup lang="ts">
import { toRef, ref, watch, type PropType } from 'vue'
import {
  Drawer as ADrawer,
  Tabs as ATabs,
  TabPane as ATabPane,
  Alert as AAlert,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useRoleDetail } from '@/modules/authentication-manager-ui/views/role/hooks/useRoleDetail'
import type { Role } from '@/modules/authentication-manager-ui/types/role'
import { authPermissions as p } from '@/modules/authentication-manager-ui/views/role/permissions'
import RoleGrantTable from '@/modules/authentication-manager-ui/views/role/components/RoleGrantTable.vue'
import RoleMembers from '@/modules/authentication-manager-ui/views/role/components/RoleMembers.vue'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import LoadState from '@/shared/components/LoadState.vue'
const props = defineProps({ role: { type: Object as PropType<Role>, default: undefined } })
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const { resource, task, grants, save } = useRoleDetail(toRef(props, 'role'))
const active = ref('grants')
watch(
  () => props.role?.id,
  () => (active.value = 'grants'),
)
</script>
<template>
  <a-drawer
    :open="!!role"
    :title="role?.name"
    width="min(1200px, 100vw)"
    destroy-on-close
    @close="emit('close')"
  >
    <a-tabs v-model:active-key="active" type="card"
      ><a-tab-pane key="grants" :tab="t('identity.permissionSettings')"
        ><a-alert v-if="task.error.value" :message="task.error.value" type="error" /><load-state
          :loading="resource.loading.value"
          :error="resource.error.value"
          @retry="resource.load"
          ><role-grant-table :menus="grants" /><permission-button
            :permission="p.roles.edit"
            type="primary"
            :loading="task.busy.value"
            style="margin-top: 24px"
            @click="save"
            >{{ t('common.save') }}</permission-button
          ></load-state
        ></a-tab-pane
      ><a-tab-pane key="members" :tab="t('identity.userAssignment')"
        ><role-members v-if="role" :role-id="role.id" /></a-tab-pane
    ></a-tabs>
  </a-drawer>
</template>
