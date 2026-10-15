<script setup lang="ts">
import { computed } from 'vue'
import { menuIcon, menuIconImage } from '@/shared/utils/menu-icons'
const props = withDefaults(defineProps<{ name?: string; fallback?: string }>(), {
  name: '',
  fallback: 'AppstoreOutlined',
})
const image = computed(() => menuIconImage(props.name))
</script>
<template>
  <img v-if="image" :src="image" alt="" class="menu-icon-image" />
  <component :is="menuIcon(name, fallback)" v-else aria-hidden="true" />
</template>
<style scoped>
.menu-icon-image {
  width: 14px;
  height: 14px;
  object-fit: contain;
}
</style>
