<script setup lang="ts">
import { Tooltip as ATooltip } from 'ant-design-vue'
defineProps({ text: { type: String, default: '' } })
</script>
<template>
  <!-- This tooltip contains text only; it must not intercept clicks on neighboring controls. -->
  <a-tooltip :title="text" :overlay-style="{ pointerEvents: 'none' }"
    ><span class="ellipsis">{{ text || '—' }}</span></a-tooltip
  >
</template>
<style scoped>
.ellipsis {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
