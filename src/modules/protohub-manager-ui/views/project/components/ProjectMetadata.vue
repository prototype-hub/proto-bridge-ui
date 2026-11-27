<script setup lang="ts">
import { Tag as ATag } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { Project } from '@/modules/protohub-manager-ui/types'
defineProps<{ project: Project }>()
const { t } = useI18n()
</script>
<template>
  <div
    v-if="project.groupName || project.tags?.length || project.archivedTime != null"
    class="project-metadata"
  >
    <span
      v-if="project.groupName"
      class="project-group"
      :aria-label="`${t('proto.projectGroup')}: ${project.groupName}`"
      >{{ project.groupName }}</span
    >
    <a-tag v-for="tag in project.tags" :key="tag">{{ tag }}</a-tag>
    <a-tag v-if="project.archivedTime != null">{{ t('proto.archived') }}</a-tag>
  </div>
</template>
<style scoped>
.project-metadata {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
  min-width: 0;
}
.project-group,
.project-metadata :deep(.ant-tag) {
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
}
.project-group {
  font-size: var(--text-small);
  color: var(--color-muted);
}
.project-metadata :deep(.ant-tag) {
  margin: 0;
}
</style>
