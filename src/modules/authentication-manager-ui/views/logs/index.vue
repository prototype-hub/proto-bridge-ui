<script setup lang="ts">
defineOptions({ name: 'LogsWorkspace' })
import { Tabs as ATabs, TabPane as ATabPane } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import LogsView from '@/modules/authentication-manager-ui/views/logs/access/index.vue'
import SystemLogsView from '@/modules/authentication-manager-ui/views/logs/system/index.vue'
const { t } = useI18n()
</script>
<template>
  <a-tabs
    ><a-tab-pane key="access" :tab="t('auth.logs')"><logs-view /></a-tab-pane
    ><a-tab-pane key="system" :tab="t('system.systemLogs')"><system-logs-view /></a-tab-pane
  ></a-tabs>
</template>
