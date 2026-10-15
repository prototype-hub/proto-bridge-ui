<script setup lang="ts">
import {
  Spin as ASpin,
  Result as AResult,
  Button as AButton,
  Empty as AEmpty,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  empty: { type: Boolean, default: false },
})
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>
<template>
  <div v-if="loading" class="load-state" role="status" :aria-label="t('common.loading')">
    <a-spin />
  </div>
  <a-result v-else-if="error" status="error" :title="t('common.error')" :sub-title="error"
    ><template #extra
      ><a-button @click="emit('retry')">{{ t('common.retry') }}</a-button></template
    ></a-result
  ><a-empty v-else-if="empty" :description="t('common.empty')" /><slot v-else />
</template>
<style scoped>
.load-state {
  display: grid;
  min-height: 180px;
  place-items: center;
}
</style>
