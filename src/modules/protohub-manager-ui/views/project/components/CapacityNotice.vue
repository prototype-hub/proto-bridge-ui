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
  <div class="capacity-notice">
    <div class="capacity-line">
      <div class="capacity-summary" role="status" aria-live="polite">
        <span class="capacity-scope">{{ t(`proto.capacity.${kind}Scope`) }}</span>
        <span v-if="loading" class="muted">{{ t('proto.capacity.loading') }}</span>
        <template v-else-if="!error && capacity">
          <strong class="capacity-value">{{
            t('proto.capacity.used', {
              used: capacity.used,
              limit: capacity.limit === -1 ? t('proto.capacity.unlimited') : capacity.limit,
            })
          }}</strong>
          <span v-if="capacity.limit !== -1 && capacity.canCreate" class="muted">{{
            t('proto.capacity.remaining', { count: capacity.remaining })
          }}</span>
        </template>
      </div>
      <div v-if="$slots.actions" class="capacity-actions"><slot name="actions" /></div>
    </div>
    <a-alert v-if="!loading && (error || !capacity)" type="warning" show-icon>
      <template #message>{{ t('proto.capacity.unavailable') }}</template>
      <template #action>
        <a-button size="small" @click="emit('retry')">{{ t('common.retry') }}</a-button>
      </template>
    </a-alert>
    <a-alert v-else-if="!loading && capacity && !capacity.canCreate" type="warning" show-icon>
      <template #message>
        <strong>{{
          t(capacity.overLimit ? 'proto.capacity.overLimit' : 'proto.capacity.full')
        }}</strong>
        {{ t(`proto.capacity.${kind}Retained`) }}
      </template>
    </a-alert>
  </div>
</template>

<style scoped>
.capacity-notice {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  min-width: 0;
}
.capacity-line,
.capacity-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  min-width: 0;
}
.capacity-line {
  justify-content: space-between;
}
.capacity-summary {
  flex: 1;
}
.capacity-scope {
  color: var(--color-muted);
}
.capacity-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.capacity-actions {
  flex: 0 0 auto;
}
.capacity-notice :deep(.ant-alert-message) {
  overflow-wrap: anywhere;
}
@media (width <= 575px) {
  .capacity-summary {
    flex-basis: 100%;
  }
  .capacity-actions,
  .capacity-actions :deep(.ant-btn) {
    width: 100%;
  }
}
</style>
