<script setup lang="ts">
import type { PropType } from 'vue'
import { MenuItem as AMenuItem, SubMenu as ASubMenu } from 'ant-design-vue'
import MenuIcon from '@/shared/components/MenuIcon.vue'
import type { MenuLink } from '@/app/router/menu-adapter'
defineProps({ items: { type: Array as PropType<MenuLink[]>, required: true } })
</script>
<template>
  <template v-for="item in items" :key="item.key"
    ><a-sub-menu v-if="item.children" :key="item.key" :title="item.title"
      ><template #icon><menu-icon :name="item.icon" /></template
      ><sidebar-items :items="item.children" /></a-sub-menu
    ><a-menu-item v-else :key="item.key"
      ><template #icon><menu-icon :name="item.icon" fallback="FileTextOutlined" /></template
      ><span>{{ item.title }}</span></a-menu-item
    ></template
  >
</template>
