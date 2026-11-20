<script setup lang="ts">
import { ref, watch } from 'vue'
import { Alert as AAlert, Button as AButton } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
const props = defineProps<{
  src: string
  title: string
  loading: boolean
  error: string
  pdf?: boolean
  page?: number
  pages?: number
  width?: number
  height?: number
}>()
const emit = defineEmits<{ request: [page: number]; failed: [] }>()
const { t } = useI18n()
const fit = ref(true)
const viewport = ref<HTMLElement>()
const natural = ref({ width: 0, height: 0 })
watch(
  () => props.src,
  () => {
    natural.value = { width: 0, height: 0 }
    if (viewport.value) viewport.value.scrollTop = viewport.value.scrollLeft = 0
  },
)
function loaded(event: Event) {
  const img = event.target as HTMLImageElement
  natural.value = { width: img.naturalWidth, height: img.naturalHeight }
}
function scale(value: boolean) {
  fit.value = value
  if (viewport.value) viewport.value.scrollTop = viewport.value.scrollLeft = 0
}
function requestPage(page: number) {
  if (!props.loading && page >= 0 && page < (props.pages || 0)) emit('request', page)
}
</script>
<template>
  <section
    class="material-visual"
    :aria-label="t(pdf ? 'proto.materialPdfPreview' : 'proto.materialImagePreview')"
    :aria-busy="loading"
  >
    <div class="material-visual-toolbar">
      <h4>{{ t(pdf ? 'proto.materialPdfPreview' : 'proto.materialImagePreview') }}</h4>
      <div v-if="src" class="material-scale">
        <a-button :aria-pressed="fit" :disabled="loading" @click="scale(true)">{{
          t('proto.materialFitWidth')
        }}</a-button>
        <a-button :aria-pressed="!fit" :disabled="loading" @click="scale(false)">{{
          t('proto.materialActualSize')
        }}</a-button>
      </div>
    </div>
    <div v-if="pages && pages > 1" class="material-visual-pages">
      <a-button :aria-disabled="loading || !page" @click="requestPage((page || 0) - 1)">{{
        t('proto.materialPreviousPage')
      }}</a-button>
      <span role="status">{{
        t('proto.materialPageCount', { page: (page || 0) + 1, pages })
      }}</span>
      <a-button
        :aria-disabled="loading || (page || 0) + 1 >= pages"
        @click="requestPage((page || 0) + 1)"
        >{{ t('proto.materialNextPage') }}</a-button
      >
    </div>
    <p v-if="loading" class="muted" role="status">{{ t('proto.materialVisualLoading') }}</p>
    <a-alert
      v-if="error"
      tabindex="-1"
      type="warning"
      role="alert"
      :message="error"
      :description="t('proto.materialVisualFallback')"
    />
    <div
      v-if="src"
      ref="viewport"
      class="material-visual-viewport"
      tabindex="0"
      role="region"
      :aria-label="t('proto.materialVisualRegion')"
    >
      <img
        :src="src"
        :alt="title"
        :width="width || natural.width || undefined"
        :height="height || natural.height || undefined"
        :class="{ 'actual-size': !fit }"
        @load="loaded"
        @error="emit('failed')"
      />
    </div>
    <div v-else-if="!loading" class="material-visual-start">
      <p class="muted">{{ t(pdf ? 'proto.materialPdfHint' : 'proto.materialImageHint') }}</p>
      <a-button type="primary" @click="emit('request', page || 0)">{{
        t(
          error
            ? 'proto.materialVisualRetry'
            : pdf
              ? 'proto.materialPdfOpen'
              : 'proto.materialPreview',
        )
      }}</a-button>
    </div>
  </section>
</template>
<style scoped>
.material-visual {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-4);
  min-width: 0;
}
.material-visual-toolbar,
.material-scale,
.material-visual-pages {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.material-visual-toolbar {
  justify-content: space-between;
}
.material-visual-toolbar h4 {
  font-size: 16px;
  margin: 0;
}
.material-scale :deep([aria-pressed='true']) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.material-visual-pages {
  justify-content: space-between;
  font-variant-numeric: tabular-nums;
}
.material-visual-pages :deep([aria-disabled='true']) {
  color: var(--color-muted);
  background: var(--color-background);
  cursor: not-allowed;
}
.material-visual-start {
  padding: var(--space-4);
  background: var(--color-background);
}
.material-visual-start p {
  margin: 0 0 var(--space-3);
  line-height: 1.6;
}
.material-visual-viewport {
  max-height: 58vh;
  min-height: 180px;
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--color-background);
  scrollbar-color: var(--color-border) var(--color-background);
}
.material-visual-viewport img {
  display: block;
  max-width: 100%;
  height: auto;
  margin-inline: auto;
}
.material-visual-viewport img.actual-size {
  max-width: none;
  margin-inline: 0;
}
.material-visual-viewport:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
@media (max-width: 700px) {
  .material-visual :deep(.ant-btn) {
    min-height: 40px;
    height: auto;
    white-space: normal;
  }
}
</style>
