<script setup lang="ts">
import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { Alert as AAlert, Button as AButton, Drawer as ADrawer, Tag as ATag } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import LoadState from '@/shared/components/LoadState.vue'
import { revisionApprovalApi } from '../api/revision-approval'
import type { PublicApproval } from '../types/revision-approval'
import type { PublicShare } from '../types'
const props = defineProps<{ share?: PublicShare }>()
const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
function time(value: number) {
  return new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}
const current = shallowRef<PublicApproval>(),
  loading = ref(false),
  error = ref('')
let generation = 0,
  controller: AbortController | undefined
async function load() {
  controller?.abort()
  const selected = props.share,
    epoch = ++generation
  current.value = undefined
  error.value = ''
  loading.value = false
  if (!selected?.accessKey || !selected.revisionId) {
    error.value = t('proto.approvalUnavailable')
    return
  }
  const request = (controller = new AbortController())
  loading.value = true
  try {
    const row = await revisionApprovalApi.publicContext(
      selected.token,
      { revisionId: selected.revisionId, accessKey: selected.accessKey },
      { signal: request.signal, silent: true },
    )
    if (epoch !== generation || request.signal.aborted) return
    if (row.revisionId !== selected.revisionId) throw new Error('scope')
    current.value = row
  } catch {
    if (epoch === generation && !request.signal.aborted)
      error.value = t('proto.approvalUnavailable')
  } finally {
    if (epoch === generation) loading.value = false
  }
}
watch(
  () =>
    JSON.stringify([
      props.share?.token,
      props.share?.revisionId,
      props.share?.accessKey,
      props.share?.revisionMode,
    ]),
  load,
  { immediate: true, flush: 'sync' },
)
onScopeDispose(() => {
  generation++
  controller?.abort()
})
</script>
<template>
  <a-drawer
    :open="true"
    :title="t('proto.approvalTitle')"
    width="min(560px, 100vw)"
    @close="emit('close')"
  >
    <section
      class="public-approval stack"
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.approvalTitle')"
    >
      <header>
        <h2>{{ share?.versionName }}</h2>
        <p class="muted">
          {{ t('proto.approvalFixed') }} · <span translate="no">{{ share?.revisionId }}</span>
        </p>
      </header>
      <load-state :loading="loading" :error="error" @retry="load">
        <template v-if="current"
          ><div class="public-approval-status">
            <a-tag :color="current.approved ? 'green' : 'default'">{{
              t(current.approved ? 'proto.approvalApproved' : 'proto.approvalPending')
            }}</a-tag
            ><a-tag :color="current.published ? 'blue' : 'default'">{{
              t(current.published ? 'proto.approvalPublished' : 'proto.approvalUnpublished')
            }}</a-tag>
          </div>
          <p v-if="current.approvedAt">
            {{ t('proto.approvalAt') }} · {{ time(current.approvedAt) }}
          </p>
          <p v-if="current.publishedAt">
            {{ t('proto.publicationAt') }} · {{ time(current.publishedAt) }}
          </p>
          <a-alert type="info" :message="t('proto.approvalPublicHint')"
        /></template>
      </load-state>
      <a-button @click="emit('close')">{{ t('common.close') }}</a-button>
    </section>
  </a-drawer>
</template>
<style scoped>
.public-approval {
  overflow-wrap: anywhere;
}

.public-approval h2 {
  margin: 0;
}

.public-approval-status {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
</style>
