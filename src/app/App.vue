<script setup lang="ts">
import { useBranding } from './stores/branding'
import { onMounted, computed, onErrorCaptured, ref } from 'vue'
import {
  ConfigProvider as AConfigProvider,
  Result as AResult,
  Button as AButton,
} from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import enUS from 'ant-design-vue/es/locale/en_US'
import { RouterView } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { theme } from './providers/theme'
onMounted(() => void useBranding().load())
const { locale, t } = useI18n()
const antLocale = computed(() => (locale.value === 'zh' ? zhCN : enUS))
const failed = ref(false)
onErrorCaptured(() => {
  failed.value = true
  return false
})
const reload = () => window.location.reload()
</script>
<template>
  <a-config-provider :locale="antLocale" :auto-insert-space-in-button="false" :theme="theme"
    ><a-result v-if="failed" status="error" :title="t('common.clientError')"
      ><template #extra
        ><a-button @click="reload">{{ t('common.retry') }}</a-button></template
      ></a-result
    ><router-view v-else
  /></a-config-provider>
</template>
