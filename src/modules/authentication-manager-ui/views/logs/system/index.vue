<script setup lang="ts">
defineOptions({ name: 'SystemLogsView' })
import LogList from '@/modules/authentication-manager-ui/views/logs/components/LogList.vue'
</script>
<template><log-list kind="system" /></template>
