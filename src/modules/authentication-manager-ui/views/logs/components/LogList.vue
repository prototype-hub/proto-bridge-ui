<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { Tag as ATag } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { EyeOutlined } from '@ant-design/icons-vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import { request } from '@/shared/api/client'
import type { QueryField, PageResult } from '@/shared/api/types'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import { isRecord, displayValue } from '@/modules/authentication-manager-ui/utils/model'
import { logTerms } from '@/modules/authentication-manager-ui/views/logs/utils/query'
import { usePaged } from '@/shared/composables/usePaged'
import PageContainer from '@/shared/components/PageContainer.vue'
import QueryTable from '@/shared/components/QueryTable.vue'
import LogDetails from '@/modules/authentication-manager-ui/views/logs/components/LogDetails.vue'
const props = defineProps<{ kind: 'access' | 'system' }>(),
  { t } = useI18n(),
  detail = ref<SystemRecord>()
const list = usePaged(
  async (query, options) =>
    (await request.post<PageResult<SystemRecord>>(`/logger/${props.kind}/_query`, query, options))
      .result,
  'name',
  { sorts: [{ name: props.kind === 'access' ? 'responseTime' : 'createTime', order: 'desc' }] },
)
const fields = computed<QueryField[]>(() =>
  props.kind === 'access'
    ? [
        { key: 'ip', label: 'configuration.ip' },
        { key: 'url', label: 'configuration.accessUrl' },
        { key: 'action', label: 'configuration.description' },
        {
          key: 'httpMethod',
          label: 'auth.method',
          type: 'select',
          options: ['POST', 'GET', 'PATCH', 'DELETE', 'PUT'].map((value) => ({
            value,
            label: value,
          })),
        },
        { key: 'requestTime', label: 'configuration.requestTime', type: 'date' },
      ]
    : [
        { key: 'name', label: 'configuration.logName' },
        {
          key: 'level',
          label: 'configuration.level',
          type: 'select',
          options: ['ERROR', 'INFO', 'DEBUG', 'WARN'].map((value) => ({ value, label: value })),
        },
        { key: 'message', label: 'configuration.message' },
        { key: 'context.server', label: 'configuration.server' },
        { key: 'createTime', label: 'common.createdAt', type: 'date' },
      ],
)
const columns = computed(() =>
  props.kind === 'access'
    ? [
        { title: t('configuration.ip'), dataIndex: 'ip', width: 140 },
        { title: t('configuration.accessUrl'), dataIndex: 'url', ellipsis: true },
        { title: t('configuration.description'), dataIndex: 'action', ellipsis: true },
        { title: t('auth.method'), dataIndex: 'httpMethod', width: 100 },
        { title: t('configuration.requestTime'), dataIndex: 'requestTime', width: 180 },
        { title: t('configuration.duration'), key: 'duration', width: 110 },
        { title: t('configuration.operator'), key: 'operator', width: 140 },
        { title: t('common.actions'), key: 'actions', width: 64 },
      ]
    : [
        { title: t('configuration.logName'), dataIndex: 'name', ellipsis: true },
        { title: t('configuration.level'), dataIndex: 'level', width: 100 },
        { title: t('configuration.message'), dataIndex: 'message', ellipsis: true },
        { title: t('configuration.server'), key: 'server', width: 160 },
        { title: t('common.createdAt'), dataIndex: 'createTime', width: 180 },
        { title: t('common.actions'), key: 'actions', width: 64 },
      ],
)
function nested(record: SystemRecord, key: string) {
  return isRecord(record.context) ? displayValue(record.context[key]) : '—'
}
function time(value: unknown) {
  return typeof value === 'number'
    ? dayjs(value).format('YYYY-MM-DD HH:mm:ss')
    : displayValue(value)
}
function duration(record: SystemRecord) {
  return typeof record.responseTime === 'number' && typeof record.requestTime === 'number'
    ? `${record.responseTime - record.requestTime} ms`
    : '—'
}
</script>
<template>
  <page-container :title="t(kind === 'access' ? 'auth.logs' : 'system.systemLogs')"
    ><query-table
      :fields="fields"
      :target="kind === 'access' ? 'search-access' : 'search-system'"
      :rows="list.data.value.data"
      :columns="columns"
      :pagination="list.pagination"
      :loading="list.loading.value"
      :error="list.error.value"
      @search="
        ($event) => {
          list.searchQuery({ ...$event, terms: logTerms($event.terms || [], kind) })
        }
      "
      @page="list.page"
      @refresh="list.load"
      @retry="list.load"
    >
      <template #cell="{ column, record }">
        <action-button
          v-if="column.key === 'actions'"
          :label="t('common.detail')"
          :icon="EyeOutlined"
          @action="detail = record"
        />
        <a-tag v-else-if="column.key === 'duration'" color="purple">{{ duration(record) }}</a-tag
        ><a-tag v-else-if="column.key === 'operator'" color="blue">{{
          nested(record, 'userName')
        }}</a-tag>
        <template v-else-if="column.key === 'server'">{{ nested(record, 'server') }}</template
        ><template v-else-if="['requestTime', 'createTime'].includes(column.dataIndex)">{{
          time(record[column.dataIndex])
        }}</template>
        <a-tag
          v-else-if="column.dataIndex === 'level'"
          :color="
            record.level === 'WARN'
              ? 'orange'
              : record.level === 'ERROR'
                ? 'red'
                : record.level === 'DEBUG'
                  ? 'blue'
                  : 'green'
          "
          >{{ record.level }}</a-tag
        ><template v-else>{{ record[column.dataIndex] }}</template>
      </template>
    </query-table>
    <log-details :record="detail" :kind="kind" @close="detail = undefined"
  /></page-container>
</template>
