<script setup lang="ts">
import { onMounted } from 'vue'
import { Result as AResult } from 'ant-design-vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
const route = useRoute(),
  { t } = useI18n()
onMounted(() => {
  const code = String(route.query.code || '')
  if (code) localStorage.setItem('wexin_code', code)
})
</script>
<template><a-result status="success" :title="t('system.bindingCallback')" /></template>
