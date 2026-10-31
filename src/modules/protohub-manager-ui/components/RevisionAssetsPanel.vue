<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRef, watch } from 'vue'
import {
  Alert as AAlert,
  Button as AButton,
  Checkbox as ACheckbox,
  Empty as AEmpty,
  InputSearch as AInputSearch,
  Pagination as APagination,
} from 'ant-design-vue'
import { DownloadOutlined, FileImageOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { Revision } from '../types'
import { useRevisionAssets } from '../hooks/useRevisionAssets'
import LoadState from '@/shared/components/LoadState.vue'

const props = defineProps<{
  revision: Revision
  projectName: string
  allowed: boolean
  returnLabel?: string
}>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const state = useRevisionAssets(toRef(props, 'revision'), toRef(props, 'allowed'))
const report = state.data
const heading = ref<HTMLElement>()
const cancelTrigger = ref<{ $el: HTMLElement }>()
let downloadTrigger: HTMLElement | undefined
watch(state.downloading, async (busy) => {
  const active = document.activeElement
  if (busy) downloadTrigger = active instanceof HTMLElement ? active : undefined
  const restore = !busy && (active === cancelTrigger.value?.$el || active === document.body)
  await nextTick()
  if (busy) cancelTrigger.value?.$el.focus()
  else if (restore) downloadTrigger?.focus()
})
const blocked = computed(() => state.loading.value || state.downloading.value || !report.value)
const allOnPage = computed(
  () => !!report.value?.data.length && state.pageSelectedCount.value === report.value.data.length,
)
const someOnPage = computed(() => state.pageSelectedCount.value > 0 && !allOnPage.value)
function size(bytes: number) {
  const unit = bytes >= 1024 * 1024 ? 'MiB' : bytes >= 1024 ? 'KiB' : 'B'
  const divisor = unit === 'MiB' ? 1024 * 1024 : unit === 'KiB' ? 1024 : 1
  return `${(bytes / divisor).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`
}
onMounted(async () => {
  await nextTick()
  heading.value?.focus()
})
</script>

<template>
  <section
    class="revision-assets"
    role="dialog"
    :aria-label="t('proto.originalAssets')"
    aria-modal="true"
  >
    <header class="assets-context">
      <h2 ref="heading" tabindex="-1">
        {{ projectName }} <span class="muted assets-version">{{ revision.versionName }}</span>
      </h2>
      <p class="assets-revision">
        <span class="muted">{{ t('proto.workItemFixedRevision') }}</span> {{ revision.id }}
      </p>
      <p v-if="report" class="muted">
        {{ t('proto.assetsTotal', { count: report.assetCount, size: size(report.assetBytes) }) }}
      </p>
    </header>
    <form class="assets-search" @submit.prevent>
      <a-input-search
        v-model:value="state.search.value"
        :aria-label="t('proto.assetsSearch')"
        :placeholder="t('proto.assetsSearch')"
        :enter-button="t('common.search')"
        :maxlength="256"
        :disabled="state.downloading.value"
        @search="state.query"
      />
      <a-button
        v-if="state.appliedSearch.value"
        :disabled="state.downloading.value"
        @click="state.resetSearch"
        >{{ t('proto.assetsClearSearch') }}</a-button
      >
    </form>
    <p class="assets-selection-hint muted">{{ t('proto.assetsSelectionHint') }}</p>
    <load-state :loading="state.loading.value" :error="state.error.value" @retry="state.load">
      <template v-if="report">
        <div class="assets-results-bar">
          <a-checkbox
            :checked="allOnPage"
            :indeterminate="someOnPage"
            :disabled="blocked || !report.data.length"
            @change="state.selectPage($event.target.checked)"
            >{{ t('proto.assetsSelectPage') }}</a-checkbox
          >
          <span class="muted" role="status">{{
            t('proto.assetsMatches', { count: report.total, size: size(report.totalBytes) })
          }}</span>
        </div>
        <a-empty
          v-if="!report.data.length"
          :description="
            t(state.appliedSearch.value ? 'proto.assetsNoMatches' : 'proto.assetsEmpty')
          "
          class="assets-empty"
        />
        <ul v-else class="assets-list" :aria-label="t('proto.originalAssets')">
          <li v-for="asset in report.data" :key="asset.path" class="asset-row">
            <a-checkbox
              :checked="state.selection.value.has(asset.path)"
              :aria-label="t('proto.assetsSelect', { path: asset.path })"
              :disabled="blocked"
              @change="state.select(asset, $event.target.checked)"
            />
            <div class="asset-details">
              <span class="asset-path"
                ><file-image-outlined aria-hidden="true" />{{ asset.path }}</span
              >
              <span class="asset-meta muted">{{ asset.mediaType }} · {{ size(asset.size) }}</span>
            </div>
            <a-button
              :disabled="blocked"
              :aria-label="t('proto.assetsDownloadFile', { path: asset.path })"
              @click="state.save('file', false, asset)"
              ><download-outlined aria-hidden="true" />{{ t('proto.assetsOriginalFile') }}</a-button
            >
          </li>
        </ul>
        <a-pagination
          v-if="report.total > report.pageSize"
          class="assets-pagination"
          :current="report.pageIndex + 1"
          :page-size="report.pageSize"
          :total="report.total"
          :show-size-changer="false"
          :disabled="state.loading.value || state.downloading.value"
          :responsive="true"
          @change="state.page"
        />
        <details class="assets-export-all">
          <summary>{{ t('proto.assetsWholeRevision') }}</summary>
          <p>{{ t('proto.assetsAllScope') }}</p>
          <div class="assets-all-actions">
            <a-button :disabled="blocked || !report.assetCount" @click="state.save('zip', true)">{{
              t('proto.assetsDownloadAll')
            }}</a-button>
            <a-button
              :disabled="blocked || !report.assetCount"
              @click="state.save('manifest', true)"
              >{{ t('proto.assetsAllManifest') }}</a-button
            >
          </div>
          <p class="muted">{{ t('proto.assetsScope') }}</p>
          <p class="muted">{{ t('proto.assetsLimits') }}</p>
          <p class="assets-hash muted">{{ t('proto.compareHash') }}: {{ report.manifestSha256 }}</p>
        </details>
      </template>
    </load-state>
    <footer class="assets-footer">
      <a-alert
        v-if="state.downloadError.value"
        role="alert"
        type="error"
        show-icon
        :message="state.downloadError.value"
      >
        <template v-if="!report" #action
          ><a-button @click="state.load">{{ t('common.refresh') }}</a-button></template
        >
      </a-alert>
      <div class="assets-selected" aria-live="polite">
        <strong>{{
          t('proto.assetsSelected', {
            count: state.selectedCount.value,
            size: size(state.selectedBytes.value),
          })
        }}</strong>
        <a-button
          v-if="state.selectedCount.value"
          type="link"
          :disabled="state.downloading.value"
          @click="state.clearSelection"
          >{{ t('proto.assetsClearSelection') }}</a-button
        >
      </div>
      <p v-if="state.downloading.value" role="status" class="muted">
        {{ t('proto.assetsPreparing') }}
      </p>
      <div class="assets-primary-actions">
        <a-button
          type="primary"
          :disabled="blocked || !state.selectedCount.value"
          :loading="state.downloading.value"
          @click="state.save('zip')"
          ><download-outlined aria-hidden="true" />{{ t('proto.assetsDownloadSelected') }}</a-button
        >
        <a-button
          :disabled="blocked || !state.selectedCount.value"
          @click="state.save('manifest')"
          >{{ t('proto.assetsSelectedManifest') }}</a-button
        >
        <a-button
          v-if="state.downloading.value"
          ref="cancelTrigger"
          @click="state.cancelDownload"
          >{{ t('proto.assetsCancelDownload') }}</a-button
        >
        <a-button @click="emit('close')">{{ returnLabel || t('common.close') }}</a-button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.revision-assets {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
  min-width: 0;
}
.assets-context {
  display: grid;
  gap: var(--space-2);
}
.assets-context h2 {
  margin: 0;
  font-size: 18px;
  overflow-wrap: anywhere;
}
.assets-context h2:focus-visible,
.assets-export-all summary:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
.assets-version {
  margin-inline-start: var(--space-2);
  font-size: var(--text-body);
  font-weight: normal;
}
.assets-context p,
.assets-selection-hint,
.assets-footer p {
  margin: 0;
}
.assets-revision,
.assets-hash {
  overflow-wrap: anywhere;
}
.assets-search,
.assets-results-bar,
.assets-all-actions,
.assets-selected,
.assets-primary-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.assets-search :deep(.ant-input-search) {
  flex: 1;
  min-width: 0;
}
.assets-selection-hint,
.asset-meta {
  font-size: var(--text-small);
}
.assets-results-bar {
  justify-content: space-between;
  flex-wrap: wrap;
  padding-bottom: var(--space-3);
}
.assets-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.asset-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding-block: var(--space-3);
  border-top: 1px solid var(--color-border);
}
.asset-row :deep(.ant-checkbox-wrapper) {
  padding-block: var(--space-2);
}
.asset-details {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}
.asset-path {
  overflow-wrap: anywhere;
}
.asset-path :deep(.anticon) {
  margin-inline-end: var(--space-2);
  color: var(--color-muted);
}
.asset-meta,
.assets-selected,
.assets-results-bar {
  font-variant-numeric: tabular-nums;
}
.revision-assets :deep(button),
.revision-assets :deep(input) {
  scroll-margin-block: var(--space-4) 180px;
}
.assets-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-4);
}
.assets-empty {
  margin-block: var(--space-6);
}
.assets-export-all {
  padding-block: var(--space-3);
  border-top: 1px solid var(--color-border);
}
.assets-export-all summary {
  width: fit-content;
  cursor: pointer;
}
.assets-export-all p {
  margin-block: var(--space-3);
}
.assets-all-actions,
.assets-primary-actions {
  flex-wrap: wrap;
}
.assets-footer {
  position: sticky;
  bottom: -24px;
  display: grid;
  gap: var(--space-3);
  margin-inline: -24px;
  padding: var(--space-4) 24px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}
.assets-selected {
  justify-content: space-between;
  flex-wrap: wrap;
}
@media (width <= 575px) {
  .asset-row {
    grid-template-columns: 20px minmax(0, 1fr);
    gap: var(--space-2);
  }
  .asset-row > :last-child {
    grid-column: 2;
    justify-self: start;
  }
  .assets-primary-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .assets-primary-actions > :first-child {
    grid-column: 1 / -1;
  }
  .assets-primary-actions :deep(.ant-btn),
  .assets-all-actions :deep(.ant-btn) {
    height: auto;
    min-height: 36px;
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>
