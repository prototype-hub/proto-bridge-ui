<script setup lang="ts">
import { Button as AButton } from 'ant-design-vue'
import { usePermissions } from '@/shared/auth/provider'
import type { PropType } from 'vue'
const props = defineProps({
  permission: { type: [String, Array] as PropType<string | string[]>, required: true },
})
const session = usePermissions()
</script>
<template>
  <a-button v-if="session.can(props.permission)"><slot /></a-button>
</template>
