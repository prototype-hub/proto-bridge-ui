<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Modal as AModal, Button as AButton } from 'ant-design-vue'
import { FolderOpenOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { safeProjectCover } from '@/modules/protohub-manager-ui/utils/project-organization'
const props = defineProps<{ value?: string; name: string }>()
const { t } = useI18n()
const safe = computed(() => safeProjectCover(props.value))
const failed = ref(false),
  open = ref(false),
  trigger = ref<HTMLButtonElement>()
watch(safe, () => {
  failed.value = false
  open.value = false
})
async function restoreFocus() {
  await nextTick()
  trigger.value?.focus()
}
</script>
<template>
  <span class="project-cover-wrap" @click.stop @keydown.stop>
    <button
      ref="trigger"
      type="button"
      class="project-cover"
      :disabled="!safe"
      :aria-label="safe ? t('proto.coverPreview', { name }) : t('proto.coverUnavailable')"
      @click="open = true"
    >
      <img
        v-if="safe && !failed"
        referrerpolicy="no-referrer"
        :src="safe"
        alt=""
        width="64"
        height="48"
        loading="lazy"
        @error="failed = true"
      />
      <folder-open-outlined v-else aria-hidden="true" />
    </button>
    <span v-if="failed" class="sr-only" role="status">{{ t('proto.coverFailed') }}</span>
    <a-modal
      :open="open"
      :title="t('proto.coverPreview', { name })"
      :footer="null"
      :mask-closable="false"
      :width="800"
      @cancel="open = false"
      @after-close="restoreFocus"
    >
      <img
        v-if="safe && !failed"
        class="project-cover-preview"
        referrerpolicy="no-referrer"
        :src="safe"
        :alt="name"
        width="720"
        height="480"
        @error="failed = true"
      />
      <p v-else role="status">{{ t('proto.coverFailed') }}</p>
      <a-button @click="open = false">{{ t('proto.coverClose') }}</a-button>
    </a-modal>
  </span>
</template>
<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.project-cover-wrap {
  display: inline-flex;
  flex: 0 0 auto;
}
.project-cover {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 48px;
  padding: 0;
  overflow: hidden;
  color: var(--color-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  cursor: zoom-in;
}
.project-cover:disabled {
  cursor: default;
}
.project-cover:hover {
  border-color: var(--color-primary);
}
.project-cover:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.project-cover img {
  width: 64px;
  height: 48px;
  object-fit: cover;
}
.project-cover-preview {
  display: block;
  width: 100%;
  height: auto;
  max-height: 65vh;
  object-fit: contain;
  margin-bottom: var(--space-3);
}
</style>
