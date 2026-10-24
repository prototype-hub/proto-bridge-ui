<script setup lang="ts">
import { computed, toRef } from 'vue'
import { Drawer as ADrawer, Button as AButton, Alert as AAlert, Tag as ATag } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { Revision } from '@/modules/protohub-manager-ui/types'
import { useRevisionQuality } from '@/modules/protohub-manager-ui/views/project/hooks/useRevisionQuality'
import DataTable from '@/shared/components/DataTable.vue'
import LoadState from '@/shared/components/LoadState.vue'

const props = defineProps<{ revision?: Revision; allowed: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const open = computed(() => props.allowed && !!props.revision)
const state = useRevisionQuality(toRef(props, 'revision'), open)
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
    @close="emit('close')"
  >
    <section
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.qualityCheck')"
      class="stack quality-report"
    >
      <p class="quality-path">{{ t('proto.revision') }}: {{ revision?.id }}</p>
      <p>{{ t('proto.qualityScope') }}</p>
      <load-state :loading="state.loading.value" :error="state.error.value" @retry="state.load">
        <template v-if="report">
          <a-alert
            :type="!report.complete ? 'warning' : report.summary.errors ? 'error' : 'info'"
            show-icon
            :message="t(report.complete ? 'proto.qualityComplete' : 'proto.qualityIncomplete')"
          />
          <p class="quality-path">{{ t('proto.qualityEntry') }}: {{ report.entryFile }}</p>
          <p class="quality-path">{{ t('proto.compareHash') }}: {{ report.manifestSha256 }}</p>
          <p>{{ t('proto.qualitySummary', report.summary) }}</p>
          <p>{{ t('proto.qualityScanned', report.summary) }}</p>
          <p>{{ t('proto.qualityUnchecked', report.summary.uncheckedReferences) }}</p>
          <p>{{ t('proto.qualityLimits', report.limits) }}</p>
          <a-alert
            v-if="report.summary.omittedFindings || report.summary.skippedDocuments"
            type="warning"
            show-icon
            :message="t('proto.qualityOmitted', report.summary)"
          />
          <a-button :loading="state.downloading.value" @click="state.exportReport">{{
            t('proto.qualityDownload')
          }}</a-button>
          <a-alert
            v-if="state.downloadError.value"
            type="error"
            :message="state.downloadError.value"
          />
          <data-table
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
          <p v-if="!report.findings.length">{{ t('proto.qualityNoFindings') }}</p>
        </template>
      </load-state>
      <a-button @click="emit('close')">{{ t('common.close') }}</a-button>
    </section>
  </a-drawer>
</template>
<style scoped>
.quality-report {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
}

.quality-path {
  overflow-wrap: anywhere;
}
</style>
