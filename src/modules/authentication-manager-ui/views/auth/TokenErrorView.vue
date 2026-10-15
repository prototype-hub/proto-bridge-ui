<script setup lang="ts">
import { Result as AResult, Button as AButton } from 'ant-design-vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
const route = useRoute(),
  router = useRouter(),
  { t } = useI18n()
</script>
<template>
  <a-result status="warning" :title="String(route.query.proxy_error || t('system.tokenExpired'))"
    ><template #extra
      ><a-button type="primary" @click="router.push('/')">{{
        t('common.back')
      }}</a-button></template
    ></a-result
  >
</template>
