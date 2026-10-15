<script setup lang="ts">
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { rgbToHex } from '../utils/inspect'
defineProps({
  values: { type: Object as PropType<Record<string, string>>, required: true },
  title: { type: String, required: true },
})
const { t, te } = useI18n()
</script>
<template>
  <section>
    <h3>{{ title }}</h3>
    <dl class="properties">
      <template v-for="(value, key) in values" :key="key"
        ><dt>{{ te(`proto.${String(key)}`) ? t(`proto.${String(key)}`) : key }}</dt>
        <dd>{{ value.startsWith('rgb') ? rgbToHex(value) : value }}</dd></template
      >
    </dl>
  </section>
</template>
<style scoped>
.properties {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: var(--space-2);
  font-size: var(--text-small);
}
.properties dt {
  color: var(--color-muted);
}
.properties dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
