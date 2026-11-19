<script setup lang="ts">
import { computed, toRef } from 'vue'
import { Drawer as ADrawer, Button as AButton, Alert as AAlert, Tag as ATag } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useSession } from '@/app/stores/session'
import type { Revision } from '@/modules/protohub-manager-ui/types'
import { useRevisionQuality } from '@/modules/protohub-manager-ui/views/project/hooks/useRevisionQuality'
import DataTable from '@/shared/components/DataTable.vue'
import LoadState from '@/shared/components/LoadState.vue'

const props = defineProps<{ revision?: Revision; allowed: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const session = useSession()
const open = computed(() => props.allowed && !!props.revision)
const actorId = computed(() => session.user?.id)
const state = useRevisionQuality(toRef(props, 'revision'), open, actorId)
const report = state.data
const columns = computed(() => [
  { title: t('proto.qualitySeverity'), dataIndex: 'severity', width: 90 },
  { title: t('proto.qualityType'), dataIndex: 'code', width: 180 },
  { title: t('proto.qualitySource'), dataIndex: 'sourcePath', width: 210 },
  { title: t('proto.qualityTarget'), dataIndex: 'targetPath', width: 210 },
  { title: t('proto.qualityReference'), dataIndex: 'reference', width: 210 },
])
</script>
<template>
  <a-drawer
    root-class-name="revision-quality-drawer"
    :open="open"
    :title="t('proto.qualityCheck')"
    width="min(960px, 100vw)"
    :body-style="{ padding: 0, overflow: 'hidden' }"
    @close="emit('close')"
  >
    <section
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.qualityCheck')"
      class="quality-report"
    >
      <div class="quality-content stack">
        <header class="quality-context">
          <h2 class="quality-path">{{ revision?.versionName }}</h2>
          <p class="quality-path">{{ t('proto.revision') }}: {{ revision?.id }}</p>
        </header>
        <load-state :loading="state.loading.value" :error="state.error.value" @retry="state.load">
          <template v-if="report">
            <section class="quality-conclusion stack" :aria-label="t('proto.qualityConclusion')">
              <h3>{{ t('proto.qualityConclusion') }}</h3>
              <a-alert
                :type="!report.complete ? 'warning' : report.summary.errors ? 'error' : 'info'"
                show-icon
                :message="t(report.complete ? 'proto.qualityComplete' : 'proto.qualityIncomplete')"
              />
              <p class="quality-summary">{{ t('proto.qualitySummary', report.summary) }}</p>
              <p>{{ t('proto.qualityUnchecked', report.summary.uncheckedReferences) }}</p>
              <a-alert
                v-if="report.summary.omittedFindings || report.summary.skippedDocuments"
                type="warning"
                show-icon
                :message="t('proto.qualityOmitted', report.summary)"
              />
            </section>
            <section class="quality-findings stack" :aria-label="t('proto.qualityFindings')">
              <h3>{{ t('proto.qualityFindings') }}</h3>
              <data-table
                v-if="report.findings.length"
                :rows="state.rows.value"
                :columns="columns"
                :pagination="state.pagination.value"
                @page="state.page"
              >
                <template #cell="{ record, column }">
                  <a-tag
                    v-if="column.dataIndex === 'severity'"
                    :color="record.severity === 'error' ? 'red' : 'orange'"
                    >{{ t(`proto.qualitySeverities.${record.severity}`) }}</a-tag
                  >
                  <template v-else-if="column.dataIndex === 'code'">{{
                    t(`proto.qualityCodes.${record.code}`)
                  }}</template>
                  <span v-else class="quality-path">{{
                    column.dataIndex === 'sourcePath'
                      ? record.sourcePath
                      : column.dataIndex === 'targetPath'
                        ? (record.targetPath ?? '—')
                        : (record.reference ?? '—')
                  }}</span>
                </template>
              </data-table>
              <p v-else>{{ t('proto.qualityNoFindings') }}</p>
            </section>
            <details class="quality-details">
              <summary>{{ t('proto.qualityScopeDetails') }}</summary>
              <div class="stack">
                <p>{{ t('proto.qualityScope') }}</p>
                <p>{{ t('proto.qualityScanned', report.summary) }}</p>
                <p>{{ t('proto.qualityLimits', report.limits) }}</p>
                <dl class="quality-metadata">
                  <div>
                    <dt>{{ t('proto.qualityEntry') }}</dt>
                    <dd class="quality-path">{{ report.entryFile }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('proto.compareHash') }}</dt>
                    <dd class="quality-path" translate="no">{{ report.manifestSha256 }}</dd>
                  </div>
                </dl>
              </div>
            </details>
          </template>
        </load-state>
      </div>
      <footer class="quality-footer">
        <section
          v-if="report"
          class="quality-export"
          :aria-label="t('proto.qualityExport')"
          :aria-busy="state.downloading.value"
        >
          <div>
            <h3>{{ t('proto.qualityExport') }}</h3>
            <p class="muted">{{ t('proto.qualityExportHint') }}</p>
          </div>
          <!-- Keep focus while exporting so Escape still reaches the Drawer. -->
          <div class="quality-export-actions">
            <a-button
              :aria-label="t('proto.qualityDownload')"
              :aria-disabled="state.downloading.value"
              :loading="state.exportingFormat.value === 'json'"
              @click="state.exportReport('json')"
              >JSON</a-button
            >
            <a-button
              :aria-label="t('proto.qualityDownloadXlsx')"
              :aria-disabled="state.downloading.value"
              :loading="state.exportingFormat.value === 'xlsx'"
              @click="state.exportReport('xlsx')"
              >Excel (.xlsx)</a-button
            >
            <a-button
              :aria-label="t('proto.qualityDownloadDocx')"
              :aria-disabled="state.downloading.value"
              :loading="state.exportingFormat.value === 'docx'"
              @click="state.exportReport('docx')"
              >Word (.docx)</a-button
            >
          </div>
          <p v-if="state.downloading.value" role="status">{{ t('proto.qualityExporting') }}</p>
          <a-alert
            v-if="state.downloadError.value"
            type="error"
            show-icon
            :message="state.downloadError.value"
          />
        </section>
        <a-button class="quality-close" @click="emit('close')">{{ t('common.close') }}</a-button>
      </footer>
    </section>
  </a-drawer>
</template>
<style scoped>
.quality-report {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

.quality-content {
  min-height: 0;
  grid-template-columns: minmax(0, 1fr);
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--space-6);
  gap: var(--space-6);
}

.quality-context h2,
.quality-report h3,
.quality-report p {
  margin: 0;
}

.quality-context h2 {
  margin-bottom: var(--space-2);
  font-size: var(--text-title);
  text-wrap: balance;
}

.quality-report h3 {
  font-size: 1rem;
  font-weight: 600;
}

.quality-conclusion,
.quality-findings {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);
}

.quality-summary {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.quality-details {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-4);
}

.quality-details summary {
  cursor: pointer;
  padding: var(--space-2) 0;
  font-weight: 600;
}

.quality-details[open] summary {
  margin-bottom: var(--space-3);
}

.quality-metadata {
  display: grid;
  gap: var(--space-3);
  margin: 0;
}

.quality-metadata dt {
  color: var(--color-muted);
}

.quality-metadata dd {
  margin: var(--space-1) 0 0;
}

.quality-footer {
  display: flex;
  flex-shrink: 0;
  align-items: flex-end;
  gap: var(--space-4);
  margin-top: auto;
  border-top: 1px solid var(--color-border);
  padding: var(--space-4) var(--space-6);
}

.quality-export {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: var(--space-3);
}

.quality-export h3 {
  margin-bottom: var(--space-1);
}

.quality-export-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.quality-path {
  overflow-wrap: anywhere;
}

@media (width <= 640px) {
  .quality-content,
  .quality-footer {
    padding: var(--space-4);
  }

  .quality-footer {
    flex-wrap: wrap;
  }

  .quality-export {
    flex-basis: 100%;
  }

  .quality-export-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .quality-export-actions :deep(.ant-btn) {
    padding-inline: var(--space-2);
  }

  .quality-close {
    margin-left: auto;
  }
}
</style>
