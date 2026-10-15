<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  Button as AButton,
  Alert as AAlert,
  Descriptions as ADescriptions,
  DescriptionsItem as ADescriptionsItem,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { authorizationApi } from '@/modules/authentication-manager-ui/api/auth/authorization'
import { displayValue } from '@/modules/authentication-manager-ui/utils/model'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import PageContainer from '@/shared/components/PageContainer.vue'
import { useTask } from '@/shared/composables/useTask'
import { saved } from '@/shared/utils/feedback'
const { t } = useI18n(),
  route = useRoute(),
  router = useRouter(),
  task = useTask(),
  data = ref<Model>({})
const code = () => String(route.query.code || route.query.bindCode || '')
async function bind() {
  await task.run(async () => {
    await authorizationApi.bind(code())
    saved()
    await router.replace('/account/center')
  })
}
onMounted(
  () =>
    void task.run(async () => {
      if (!code()) throw new Error(t('common.required'))
      data.value = (await authorizationApi.binding(code())).result
    }),
)
</script>
<template>
  <page-container :title="t('system.thirdAccounts')"
    ><div class="panel stack">
      <a-alert v-if="task.error.value" type="error" :message="task.error.value" /><a-descriptions
        :column="1"
        ><a-descriptions-item v-for="(value, key) in data" :key="key" :label="String(key)">{{
          displayValue(value)
        }}</a-descriptions-item></a-descriptions
      ><a-button type="primary" :loading="task.busy.value" :disabled="!code()" @click="bind">{{
        t('system.bind')
      }}</a-button>
    </div></page-container
  >
</template>
