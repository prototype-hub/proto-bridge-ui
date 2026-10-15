<script setup lang="ts">
defineOptions({ name: 'LogsView' })
import LogList from '@/modules/authentication-manager-ui/views/logs/components/LogList.vue'
</script>
<template><log-list kind="access" /></template>
