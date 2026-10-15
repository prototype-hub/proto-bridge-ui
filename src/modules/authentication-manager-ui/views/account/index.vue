<script setup lang="ts">
defineOptions({ name: 'AccountView' })
import {
  Descriptions as ADescriptions,
  DescriptionsItem as ADescriptionsItem,
  Button as AButton,
  Space as ASpace,
  Alert as AAlert,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useAccount } from '@/modules/authentication-manager-ui/views/account/hooks/useAccount'
import { displayValue } from '@/modules/authentication-manager-ui/utils/model'
import PageContainer from '@/shared/components/PageContainer.vue'
import LoadState from '@/shared/components/LoadState.vue'
import PasswordChangeModal from '@/modules/authentication-manager-ui/views/account/components/PasswordChangeModal.vue'
import ProfileEditor from '@/modules/authentication-manager-ui/views/account/components/ProfileEditor.vue'
const { t } = useI18n(),
  state = useAccount()
</script>
<template>
  <page-container :title="t('layout.profile')"
    ><div class="panel">
      <a-alert
        v-if="state.task.error.value"
        type="error"
        :message="state.task.error.value"
      /><load-state
        :loading="state.resource.loading.value"
        :error="state.resource.error.value"
        @retry="state.resource.load"
        ><a-descriptions bordered :column="1"
          ><a-descriptions-item
            v-for="key in [
              'username',
              'name',
              'telephone',
              'email',
              'roleList',
              'orgList',
              'positions',
            ]"
            :key="key"
            :label="t(`system.${key}`)"
            >{{ displayValue(state.profile.value[key]) }}</a-descriptions-item
          ></a-descriptions
        ><a-space class="tree-toolbar"
          ><a-button type="primary" @click="state.editing.value = { ...state.profile.value }">{{
            t('common.edit')
          }}</a-button
          ><a-button @click="state.changing.value = {}">{{
            t('system.changePassword')
          }}</a-button></a-space
        ></load-state
      >
    </div>
    <profile-editor
      v-model="state.editing.value"
      :busy="state.task.busy.value"
      :error="state.task.error.value"
      @save="state.save" />
    <password-change-modal
      :open="!!state.changing.value"
      @update:open="
        (open) => {
          if (!open) state.changing.value = undefined
        }
      "
      @completed="state.passwordChanged"
  /></page-container>
</template>
