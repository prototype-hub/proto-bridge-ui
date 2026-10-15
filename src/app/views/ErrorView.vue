<script setup lang="ts">
import { Result as AResult, Button as AButton } from 'ant-design-vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
const router = useRouter()
const route = useRoute()
const { t } = useI18n()
</script>
<template>
  <div class="public-shell">
    <a-result
      :status="route.path === '/403' ? '403' : '404'"
      :title="t(route.path === '/403' ? 'common.forbidden' : 'common.notFound')"
      ><template #extra
        ><a-button type="primary" @click="router.push('/')">{{
          t('common.home')
        }}</a-button></template
      ></a-result
    >
  </div>
</template>
