<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Card as ACard, Button as AButton, Space as ASpace, Alert as AAlert } from 'ant-design-vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authorizationApi } from '@/modules/authentication-manager-ui/api/auth/authorization'
import { safeExternalUrl } from '@/modules/authentication-manager-ui/views/auth/utils/redirect'
import { useSession } from '@/app/stores/session'
import { token } from '@/shared/auth/token'
import { useTask } from '@/shared/composables/useTask'
const { t } = useI18n(),
  router = useRouter(),
  route = useRoute(),
  session = useSession(),
  task = useTask(),
  name = ref('')
async function authorize() {
  await task.run(async () =>
    window.location.assign(
      safeExternalUrl((await authorizationApi.oauth({ ...route.query })).result),
    ),
  )
}
async function changeAccount() {
  session.clear()
  await router.replace({ path: '/login', query: { redirect: route.fullPath } })
}
onMounted(async () => {
  if (!token.get()) {
    await router.replace({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  await task.run(async () => {
    await session.initialize(false)
    name.value = String(
      (await authorizationApi.application(String(route.query.client_id || ''))).result.name || '',
    )
  })
})
</script>
<template>
  <main class="authorization-page">
    <a-card :title="t('system.authorize')"
      ><h2>{{ name }}</h2>
      <p>{{ session.user?.name }}</p>
      <a-alert v-if="task.error.value" type="error" :message="task.error.value" /><a-space
        ><a-button type="primary" :loading="task.busy.value" @click="authorize">{{
          t('system.authorize')
        }}</a-button
        ><a-button @click="changeAccount">{{ t('system.changeAccount') }}</a-button></a-space
      ></a-card
    >
  </main>
</template>
<style scoped>
.authorization-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  background: var(--color-background);
  padding: var(--space-6);
}
.ant-card {
  width: min(480px, 100%);
}
</style>
