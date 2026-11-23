<script setup lang="ts">
defineOptions({ name: 'PrototypeDiagnosticsView' })
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Alert as AAlert,
  Button as AButton,
  Result as AResult,
  Skeleton as ASkeleton,
  Tag as ATag,
} from 'ant-design-vue'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import PageContainer from '@/shared/components/PageContainer.vue'
import { useDiagnostics } from './hooks/useDiagnostics'
import type { DiagnosticCheckName, DiagnosticStatus } from '../../types/diagnostics'

const { t, locale } = useI18n()
const state = useDiagnostics()
const { data, loading, denied, failed, exportFailed, schemaInvalid, canQuery, stale } = state
const names: DiagnosticCheckName[] = ['database', 'storage', 'cleanup', 'mail', 'license']
const titles: Record<DiagnosticCheckName, string> = {
  database: 'diagnosticsDatabase',
  storage: 'diagnosticsStorage',
  cleanup: 'diagnosticsCleanup',
  mail: 'diagnosticsMail',
  license: 'diagnosticsLicense',
}
const colors: Record<DiagnosticStatus, string> = {
  ok: 'success',
  warning: 'warning',
  error: 'error',
  timeout: 'error',
}
const number = (value: number) => new Intl.NumberFormat(locale.value).format(value)
const limit = (value: number) => (value === -1 ? t('proto.licenseUnlimited') : number(value))
const yesNo = (value: boolean) => t(value ? 'proto.diagnosticsYes' : 'proto.diagnosticsNo')
const size = (bytes: number) =>
  `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(bytes / 1_048_576)} MiB`
const collectedAt = computed(() =>
  data.value
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'medium' }).format(
        data.value.collectedAt,
      )
    : '',
)
const metrics = computed(() => {
  const checks = data.value?.checks
  const result: Record<DiagnosticCheckName, { label: string; value: string }[]> = {
    database: [],
    storage: [],
    cleanup: [],
    mail: [],
    license: [],
  }
  if (!checks) return result
  const metric = (label: string, value: string) => ({ label: t(`proto.${label}`), value })
  const projects = checks.database.data?.projects
  if (projects)
    result.database = [
      metric('diagnosticsUsed', number(projects.used)),
      metric('diagnosticsLimit', limit(projects.limit)),
      metric('diagnosticsRemaining', limit(projects.remaining)),
      metric('diagnosticsCanCreate', yesNo(projects.canCreate)),
    ]
  const storage = checks.storage.data
  if (storage)
    result.storage = [
      metric('diagnosticsWritable', yesNo(storage.writable)),
      metric('diagnosticsFreeSpace', size(storage.freeBytes)),
      metric('diagnosticsMinimumSpace', size(storage.minimumFreeBytes)),
    ]
  const cleanup = checks.cleanup.data
  if (cleanup)
    result.cleanup = [
      metric('diagnosticsPending', number(cleanup.pending)),
      metric('diagnosticsDue', number(cleanup.due)),
      metric('diagnosticsRetried', number(cleanup.retried)),
      metric('diagnosticsUnknown', number(cleanup.unknown)),
    ]
  const mail = checks.mail.data
  if (mail)
    result.mail = [
      metric('diagnosticsConfigured', yesNo(mail.configured)),
      metric('diagnosticsActive', number(mail.active)),
      metric('diagnosticsQueued', number(mail.queued)),
      metric('diagnosticsCompleted', number(mail.completed)),
      metric('diagnosticsRejected', number(mail.rejected)),
    ]
  const license = checks.license.data
  if (license)
    result.license = [
      metric(
        'diagnosticsCredentialState',
        t(
          license.status === 'unknown'
            ? 'proto.diagnosticsUnknownState'
            : `proto.licenseStatus_${license.status}`,
        ),
      ),
      metric('diagnosticsTrust', yesNo(license.trustConfigured)),
      metric('diagnosticsCapacitySource', t(`proto.diagnosticsSource_${license.capacitySource}`)),
      metric('diagnosticsLimit', limit(license.projectLimit)),
      metric('diagnosticsVersionLimit', limit(license.versionLimit)),
      metric('diagnosticsModule', yesNo(license.advancedModuleAvailable)),
      metric(
        'diagnosticsAdvancedState',
        t(
          license.advancedStatus === 'unknown'
            ? 'proto.diagnosticsUnknownState'
            : `proto.licenseAdvanced_${license.advancedStatus}`,
        ),
      ),
      metric('diagnosticsFeatureCount', number(license.enabledFeatureCount)),
    ]
  return result
})
</script>

<template>
  <page-container class="diagnostics-page" :title="t('proto.diagnosticsTitle')">
    <template #actions>
      <div class="diagnostics-actions">
        <a-button
          type="primary"
          :loading="loading"
          :disabled="!canQuery || denied"
          @click="state.load"
        >
          <reload-outlined aria-hidden="true" />{{ t('proto.diagnosticsRefresh') }}
        </a-button>
        <a-button
          :disabled="!data || loading || denied || !canQuery || schemaInvalid"
          @click="state.exportSnapshot"
        >
          <download-outlined aria-hidden="true" />{{ t('proto.diagnosticsDownload') }}
        </a-button>
      </div>
    </template>
    <a-result
      v-if="!canQuery || denied"
      status="403"
      :title="t('proto.diagnosticsNoAccess')"
      :sub-title="t('proto.diagnosticsNoAccessHint')"
    />
    <template v-else>
      <p class="diagnostics-intro">{{ t('proto.diagnosticsIntro') }}</p>
      <p class="diagnostics-announcement" role="status" aria-live="polite" aria-atomic="true">
        {{
          loading
            ? t('proto.diagnosticsRefreshing')
            : data
              ? t(data.complete ? 'proto.diagnosticsComplete' : 'proto.diagnosticsPartial')
              : ''
        }}
      </p>
      <a-alert
        v-if="failed"
        type="error"
        show-icon
        :message="t('proto.diagnosticsFailed')"
        :description="
          t(schemaInvalid ? 'proto.diagnosticsSchemaError' : 'proto.diagnosticsFailedHint')
        "
      >
        <template #action
          ><a-button :disabled="loading" @click="state.load">{{
            t('common.retry')
          }}</a-button></template
        >
      </a-alert>
      <a-alert
        v-if="exportFailed"
        type="error"
        show-icon
        :message="t('proto.diagnosticsExportFailed')"
      />
      <a-skeleton v-if="loading && !data" active :paragraph="{ rows: 8 }" :title="false" />
      <template v-else-if="data">
        <div class="diagnostics-summary">
          <div>
            <h2>
              {{ t(data.complete ? 'proto.diagnosticsComplete' : 'proto.diagnosticsPartial') }}
            </h2>
            <p>{{ t('proto.diagnosticsSampledAt', { time: collectedAt }) }}</p>
          </div>
          <p>{{ t('proto.diagnosticsIndependent') }}</p>
        </div>
        <a-alert
          v-if="loading || stale"
          type="warning"
          show-icon
          :message="t(loading ? 'proto.diagnosticsLoadingRetained' : 'proto.diagnosticsStale')"
        />
        <div class="diagnostics-body">
          <section class="diagnostics-checks" aria-labelledby="diagnostics-checks-title">
            <h2 id="diagnostics-checks-title">{{ t('proto.diagnosticsChecks') }}</h2>
            <section
              v-for="name in names"
              :key="name"
              class="diagnostics-check"
              :aria-labelledby="`diagnostics-${name}-title`"
              :data-check="name"
            >
              <div class="diagnostics-check-heading">
                <h3 :id="`diagnostics-${name}-title`">{{ t(`proto.${titles[name]}`) }}</h3>
                <a-tag :color="colors[data.checks[name].status]">{{
                  t(`proto.diagnosticsStatus_${data.checks[name].status}`)
                }}</a-tag>
              </div>
              <p class="diagnostics-hint">{{ t(`proto.${titles[name]}Hint`) }}</p>
              <dl v-if="metrics[name].length" class="diagnostics-metrics">
                <div v-for="metric in metrics[name]" :key="metric.label">
                  <dt>{{ metric.label }}</dt>
                  <dd>{{ metric.value }}</dd>
                </div>
              </dl>
              <p v-else>{{ t('proto.diagnosticsUnavailable') }}</p>
              <p class="diagnostics-guidance">
                {{ t(`proto.diagnosticsCode_${data.checks[name].code}`) }}
              </p>
            </section>
          </section>
          <aside class="diagnostics-privacy" aria-labelledby="diagnostics-privacy-title">
            <h2 id="diagnostics-privacy-title">{{ t('proto.diagnosticsExportTitle') }}</h2>
            <p>{{ t('proto.diagnosticsExportHint') }}</p>
            <details>
              <summary>{{ t('proto.diagnosticsPreview') }}</summary>
              <p>{{ t('proto.diagnosticsIncluded') }}</p>
              <p>{{ t('proto.diagnosticsExcluded') }}</p>
            </details>
            <p>{{ t('proto.diagnosticsExportReview') }}</p>
            <p class="diagnostics-local">{{ t('proto.diagnosticsNoTelemetry') }}</p>
          </aside>
        </div>
      </template>
      <a-result
        v-else-if="!failed"
        :title="t('proto.diagnosticsEmpty')"
        :sub-title="t('proto.diagnosticsEmptyHint')"
      />
    </template>
  </page-container>
</template>

<style scoped>
.diagnostics-page {
  display: grid;
  gap: var(--space-4);
}
.diagnostics-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.diagnostics-intro,
.diagnostics-announcement {
  margin: 0;
}
.diagnostics-intro {
  max-width: 75ch;
  color: var(--color-muted);
  line-height: 1.7;
}
.diagnostics-announcement:empty {
  display: none;
}
.diagnostics-announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.diagnostics-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-6);
  background: var(--color-surface);
  border-radius: var(--radius);
}
.diagnostics-summary h2 {
  margin: 0 0 var(--space-2);
}
.diagnostics-summary p {
  margin: 0;
  color: var(--color-muted);
  line-height: 1.7;
}
.diagnostics-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(15rem, 20rem);
  align-items: start;
  gap: var(--space-4);
}
.diagnostics-checks {
  min-width: 0;
  padding: var(--space-6);
  background: var(--color-surface);
  border-radius: var(--radius);
}
.diagnostics-checks > h2 {
  margin: 0 0 var(--space-4);
}
.diagnostics-check {
  padding: var(--space-6) 0;
  border-top: 1px solid var(--color-border);
}
.diagnostics-check:last-child {
  padding-bottom: 0;
}
.diagnostics-check-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}
.diagnostics-check-heading h3 {
  margin: 0;
  font-size: var(--text-body);
}
.diagnostics-check-heading :deep(.ant-tag) {
  margin: 0;
}
.diagnostics-page h2 {
  font-size: 1rem;
  line-height: 1.5;
}
.diagnostics-hint {
  color: var(--color-muted);
  margin: var(--space-2) 0 var(--space-4);
  line-height: 1.7;
}
.diagnostics-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.diagnostics-metrics dt {
  color: var(--color-muted);
  font-size: var(--text-small);
  line-height: 1.6;
}
.diagnostics-metrics dd {
  margin: var(--space-1) 0 0;
  line-height: 1.6;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.diagnostics-guidance {
  margin: var(--space-4) 0 0;
  line-height: 1.7;
  max-width: 75ch;
}
.diagnostics-privacy {
  padding: var(--space-6);
  background: var(--color-surface);
  border-radius: var(--radius);
  overflow-wrap: anywhere;
}
.diagnostics-privacy h2 {
  margin: 0 0 var(--space-3);
}
.diagnostics-privacy p {
  line-height: 1.7;
  margin: 0 0 var(--space-4);
}
.diagnostics-privacy summary {
  cursor: pointer;
  color: var(--color-primary);
  line-height: 1.7;
  padding: var(--space-2) 0;
}
.diagnostics-privacy details p {
  color: var(--color-muted);
  margin-top: var(--space-3);
}
.diagnostics-privacy .diagnostics-local {
  margin-bottom: 0;
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-4);
  font-weight: 600;
}
@media (width <= 1100px) {
  .diagnostics-body {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (width <= 600px) {
  .diagnostics-summary {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
  .diagnostics-actions {
    width: 100%;
  }
  .diagnostics-actions :deep(.ant-btn) {
    min-height: 2.75rem;
    height: auto;
    white-space: normal;
  }
  .diagnostics-checks,
  .diagnostics-privacy,
  .diagnostics-summary {
    padding: var(--space-4);
  }
  .diagnostics-metrics {
    gap: var(--space-3);
  }
}
</style>
