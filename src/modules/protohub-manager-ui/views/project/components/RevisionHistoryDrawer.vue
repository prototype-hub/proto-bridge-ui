<script setup lang="ts">
import { computed, toRef } from 'vue'
import { Drawer as ADrawer, Button as AButton, Tag as ATag, Alert as AAlert } from 'ant-design-vue'
import { EyeOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { usePermissions } from '@/shared/auth/provider'
import type { Project, Version } from '@/modules/protohub-manager-ui/types'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { useRevisions } from '@/modules/protohub-manager-ui/views/project/hooks/useRevisions'
import DataTable from '@/shared/components/DataTable.vue'
import LoadState from '@/shared/components/LoadState.vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'

const props = defineProps<{ version?: Version; project?: Project }>()
const emit = defineEmits<{ close: []; preview: [version: Version, revisionId: string] }>()
const { t } = useI18n()
const permissions = usePermissions()
const open = computed(
  () =>
    !!props.version &&
    projectAllows(props.project, 'read') &&
    props.version.projectId === props.project?.id &&
    permissions.can(p.version.query),
)
const state = useRevisions(toRef(props, 'version'), open)
const columns = computed(() => [
  { title: t('proto.revision'), dataIndex: 'id', width: 180 },
  { title: t('common.createdAt'), dataIndex: 'createdAt', width: 180 },
  { title: t('proto.revisionFiles'), dataIndex: 'fileCount', width: 90 },
  { title: t('proto.revisionSize'), dataIndex: 'totalBytes', width: 110 },
  { title: t('common.actions'), key: 'actions', width: 64 },
])
</script>
<template>
  <a-drawer
    root-class-name="revision-history-drawer"
    :open="open"
    :title="t('proto.revisionHistory')"
    :width="800"
    @close="emit('close')"
  >
    <section role="dialog" aria-modal="true" :aria-label="t('proto.revisionHistory')" class="stack">
      <a-alert type="info" show-icon :message="t('proto.revisionHistoryHint')" />
      <load-state
        :loading="state.loading.value && !state.rows.value.length"
        :error="state.error.value"
        :empty="!state.rows.value.length"
        @retry="state.load()"
      >
        <data-table :rows="state.rows.value" :columns="columns">
          <template #cell="{ record, column }">
            <template v-if="column.dataIndex === 'id'">
              <text-ellipsis :text="record.id" />
              <a-tag v-if="record.id === version?.currentRevisionId" color="green">{{
                t('proto.currentRevision')
              }}</a-tag>
            </template>
            <template v-else-if="column.dataIndex === 'createdAt'">{{
              new Date(record.createdAt).toLocaleString()
            }}</template>
            <template v-else-if="column.dataIndex === 'totalBytes'"
              >{{ (record.totalBytes / 1024 / 1024).toFixed(2) }} MiB</template
            >
            <action-button
              v-else-if="column.key === 'actions'"
              :label="t('proto.preview')"
              :icon="EyeOutlined"
              :permission="p.version.query"
              @action="version && emit('preview', version, record.id)"
            />
            <template v-else>{{ record.fileCount }}</template>
          </template>
        </data-table>
        <a-button
          v-if="state.hasMore.value"
          :loading="state.loading.value"
          @click="state.load(true)"
        >
          {{ t('proto.loadMoreRevisions') }}
        </a-button>
      </load-state>
      <a-button @click="emit('close')">{{ t('common.close') }}</a-button>
    </section>
  </a-drawer>
</template>
