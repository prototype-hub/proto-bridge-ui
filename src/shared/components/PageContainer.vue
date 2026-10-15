<script setup lang="ts">
import { Button as AButton } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
const props = defineProps({
  title: { type: String, required: true },
  back: { type: Boolean, default: false },
})
const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
</script>
<template>
  <section>
    <header class="toolbar pro-page-header">
      <div>
        <a-button v-if="props.back" @click="emit('back')">{{ t('common.back') }}</a-button>
        <h1 class="page-title">{{ props.title }}</h1>
      </div>
      <slot name="actions" />
    </header>
    <slot />
  </section>
</template>
<style scoped>
.pro-page-header {
  padding: var(--space-4) var(--space-6);
  background: var(--color-surface);
  border-radius: var(--radius);
  margin-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.page-title {
  margin: var(--space-3) 0;
  font-size: var(--text-title);
}
</style>
