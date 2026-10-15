<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import {
  Modal as AModal,
  Descriptions as ADescriptions,
  DescriptionsItem as ADescriptionsItem,
  Tag as ATag,
  Collapse as ACollapse,
  CollapsePanel as ACollapsePanel,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import { jsonValue, displayValue } from '@/modules/authentication-manager-ui/utils/model'
const props = defineProps<{ record?: SystemRecord; kind: 'access' | 'system' }>(),
  emit = defineEmits<{ close: [] }>(),
  { t } = useI18n()
const time = (value: unknown) =>
  typeof value === 'number'
    ? dayjs(value).format('YYYY-MM-DD HH:mm:ss')
    : displayValue(value) || '—'
const color = (level: unknown) =>
  level === 'WARN' ? 'orange' : level === 'ERROR' ? 'red' : level === 'DEBUG' ? 'blue' : 'green'
const duration = computed(() =>
  typeof props.record?.responseTime === 'number' && typeof props.record?.requestTime === 'number'
    ? props.record.responseTime - props.record.requestTime
    : undefined,
)
const simple = [
  { key: 'url', label: 'configuration.url' },
  { key: 'httpMethod', label: 'auth.method' },
  { key: 'action', label: 'configuration.action' },
  { key: 'target', label: 'configuration.target' },
  { key: 'method', label: 'configuration.method' },
  { key: 'ip', label: 'configuration.ip' },
]
const structured = [
  { key: 'httpHeaders', label: 'configuration.headers' },
  { key: 'parameters', label: 'configuration.parameters' },
  { key: 'exception', label: 'configuration.exception' },
]
</script>
<template>
  <a-modal
    :open="!!record"
    :title="t(kind === 'access' ? 'configuration.accessDetail' : 'configuration.systemDetail')"
    :width="1100"
    :footer="null"
    @cancel="emit('close')"
  >
    <template v-if="record"
      ><a-descriptions v-if="kind === 'access'" bordered :column="{ xs: 1, sm: 2 }"
        ><a-descriptions-item v-for="field in simple" :key="field.key" :label="t(field.label)">{{
          displayValue(record[field.key]) || '—'
        }}</a-descriptions-item
        ><a-descriptions-item :label="t('configuration.requestTime')">{{
          time(record.requestTime)
        }}</a-descriptions-item
        ><a-descriptions-item :label="t('configuration.duration')">{{
          duration === undefined ? '—' : `${duration} ms`
        }}</a-descriptions-item
        ><a-descriptions-item
          v-for="field in structured"
          :key="field.key"
          :span="2"
          :label="t(field.label)"
        >
          <pre class="log-pre">{{
            typeof record[field.key] === 'string' ? record[field.key] : jsonValue(record[field.key])
          }}</pre>
        </a-descriptions-item></a-descriptions
      >
      <template v-else
        ><div class="log-meta">
          <span>[{{ record.threadName }}]</span><span>{{ time(record.createTime) }}</span
          ><span>{{ record.className }}</span>
        </div>
        <p>
          <a-tag :color="color(record.level)">{{ record.level }}</a-tag
          >{{ record.message }}
        </p>
        <pre class="log-stack">{{ record.exceptionStack || '—' }}</pre>
      </template>
      <a-collapse class="log-raw"
        ><a-collapse-panel key="raw" :header="t('configuration.rawData')">
          <pre class="log-pre">{{ jsonValue(record) }}</pre>
        </a-collapse-panel></a-collapse
      >
    </template>
  </a-modal>
</template>
<style scoped>
.log-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  color: #8c8c8c;
}
.log-pre {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 400px;
  overflow: auto;
}
.log-stack {
  padding: 16px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  max-height: 500px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.log-raw {
  margin-top: 16px;
}
</style>
