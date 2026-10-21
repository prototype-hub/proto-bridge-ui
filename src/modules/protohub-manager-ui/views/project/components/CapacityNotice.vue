<script setup lang="ts">
import { Alert as AAlert, Button as AButton } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { Capacity } from '@/modules/protohub-manager-ui/types'

defineProps<{
  capacity?: Capacity
  loading: boolean
  error: string
  kind: 'projects' | 'versions'
}>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="capacity-notice" role="status" aria-live="polite">
    <span v-if="loading" class="muted">{{ t('proto.capacity.loading') }}</span>
    <a-alert v-else-if="error || !capacity" type="warning" show-icon>
      <template #message>{{ t('proto.capacity.unavailable') }}</template>
      <template #action>
        <a-button size="small" @click="emit('retry')">{{ t('common.retry') }}</a-button>
      </template>
    </a-alert>
    <template v-else>
      <span>{{ t(`proto.capacity.${kind}`, { used: capacity.used, limit: capacity.limit }) }}</span>
      <a-alert
        v-if="!capacity.canCreate"
        type="warning"
        show-icon
        :message="t(capacity.overLimit ? 'proto.capacity.overLimit' : 'proto.capacity.full')"
        :description="t(`proto.capacity.${kind}Retained`)"
      />
    </template>
  </div>
</template>

<style scoped>
.capacity-notice {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
</style>
