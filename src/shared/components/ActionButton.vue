<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { Button as AButton, Popconfirm as APopconfirm, Tooltip as ATooltip } from 'ant-design-vue'
import { usePermissions } from '@/shared/auth/provider'

const props = defineProps<{
  label: string
  icon: Component
  permission?: string | string[]
  tooltip?: string
  confirm?: string
  disabled?: boolean
  loading?: boolean
  danger?: boolean
}>()
const emit = defineEmits<{ action: [] }>()
const permissions = usePermissions()
const allowed = computed(() => !props.permission || permissions.can(props.permission))
const blocked = computed(() => !!props.disabled || !!props.loading)
const open = ref(false)

function act() {
  if (allowed.value && !blocked.value) emit('action')
}
function click() {
  if (!props.confirm) act()
}
watch([allowed, blocked], ([permitted, disabled]) => {
  if (!permitted || disabled) open.value = false
})
</script>

<template>
  <a-tooltip v-if="allowed" :title="tooltip || label">
    <span class="action-button-trigger">
      <a-popconfirm
        v-model:open="open"
        :title="confirm"
        :disabled="!confirm || blocked"
        @confirm="act"
      >
        <a-button
          class="action-button"
          type="text"
          :aria-label="label"
          :danger="danger"
          :disabled="blocked"
          :loading="loading"
          @click="click"
        >
          <template #icon><component :is="icon" /></template>
        </a-button>
      </a-popconfirm>
    </span>
  </a-tooltip>
</template>

<style scoped>
.action-button-trigger {
  display: inline-flex;
  width: 32px;
  height: 32px;
  white-space: nowrap;
}
.action-button {
  width: 32px;
  min-width: 32px;
  height: 32px;
  padding: 0;
  white-space: nowrap;
}
</style>
