<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { WorkspaceContext } from '../types'
import { flattenPages, selectablePage, stablePageId } from '../utils/preview-location'
import { runtimePageUrl } from '../utils/urls'
const props = defineProps<{ context: WorkspaceContext; pageId: string }>()
const { t } = useI18n()
const failed = ref(false)
const page = computed(() =>
  flattenPages(props.context.pages).find(
    (item) =>
      stablePageId(item, props.context.pages) === props.pageId &&
      selectablePage(item, props.context.runtimeBaseUrl),
  ),
)
const url = computed(() =>
  page.value?.path ? runtimePageUrl(props.context.runtimeBaseUrl, page.value.path) : undefined,
)
watch(url, () => {
  failed.value = false
})
</script>
<template>
  <section class="demo-player" :aria-label="t('proto.demoPrototype')">
    <p class="demo-player-page">
      {{ page?.name }} <span>{{ page?.path }}</span>
    </p>
    <p v-if="!url || failed" role="alert">{{ t('proto.demoPageUnavailable') }}</p>
    <iframe
      v-else
      :src="url"
      :title="t('proto.demoPrototypePage', { name: page?.name })"
      sandbox="allow-scripts allow-forms"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
  </section>
</template>
<style scoped>
.demo-player {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 380px;
  background: var(--color-bg);
}
.demo-player-page {
  padding: 12px 16px;
  margin: 0;
  overflow-wrap: anywhere;
  font-weight: 600;
}
.demo-player-page span {
  color: var(--color-muted);
  font-weight: 400;
  margin-left: 8px;
}
.demo-player iframe {
  flex: 1;
  border: 0;
  width: 100%;
  min-height: 360px;
  background: var(--color-surface);
}
@media (max-width: 700px) {
  .demo-player {
    min-height: 320px;
  }
  .demo-player iframe {
    min-height: 320px;
  }
}
</style>
