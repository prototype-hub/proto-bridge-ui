<script setup lang="ts">
import { computed, defineAsyncComponent, toRef, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Drawer as ADrawer,
  Button as AButton,
  Tag as ATag,
  Alert as AAlert,
  Checkbox as ACheckbox,
} from 'ant-design-vue'
import { EyeOutlined, FileSearchOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { usePermissions } from '@/shared/auth/provider'
import type { Project, Revision, Version } from '@/modules/protohub-manager-ui/types'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import { useRevisions } from '@/modules/protohub-manager-ui/views/project/hooks/useRevisions'
import DataTable from '@/shared/components/DataTable.vue'
import LoadState from '@/shared/components/LoadState.vue'
import ActionButton from '@/shared/components/ActionButton.vue'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
import { applicationUrl } from '@/modules/protohub-manager-ui/utils/urls'

const props = defineProps<{ version?: Version; project?: Project }>()
const RevisionQualityDrawer = defineAsyncComponent(() => import('./RevisionQualityDrawer.vue'))
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
const router = useRouter()
const selected = ref<string[]>([])
const qualityRevision = shallowRef<Revision>()
// Selection survives cursor appends, but cannot cross a closed or replaced version scope.
watch(
  () => [open.value, props.version?.id],
  () => {
    selected.value = []
    qualityRevision.value = undefined
  },
)
function select(id: string, checked: boolean) {
  selected.value = checked
    ? [...selected.value, id].slice(0, 2)
    : selected.value.filter((value) => value !== id)
}
function compare() {
  if (!open.value || selected.value.length !== 2 || !props.version) return
  window.open(
    applicationUrl(
      router,
      router.resolve({
        name: 'PrototypeHub-revision-compare',
        params: { projectId: props.version.projectId, versionId: props.version.id },
        query: { leftRevisionId: selected.value[0], rightRevisionId: selected.value[1] },
      }).fullPath,
    ),
    '_blank',
    'noopener,noreferrer',
  )
}
const columns = computed(() => [
  { title: t('proto.compareSelect'), key: 'select', width: 64 },
  { title: t('proto.revision'), dataIndex: 'id', width: 180 },
  { title: t('common.createdAt'), dataIndex: 'createdAt', width: 180 },
  { title: t('proto.revisionFiles'), dataIndex: 'fileCount', width: 90 },
  { title: t('proto.revisionSize'), dataIndex: 'totalBytes', width: 110 },
  { title: t('common.actions'), key: 'actions', width: 96 },
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
      <p>{{ t('proto.compareSelectionHint') }}</p>
      <a-button type="primary" :disabled="selected.length !== 2 || !open" @click="compare">{{
        t('proto.compareRevisions')
      }}</a-button>
      <load-state
        :loading="state.loading.value && !state.rows.value.length"
        :error="state.error.value"
        :empty="!state.rows.value.length"
        @retry="state.load()"
      >
        <data-table :rows="state.rows.value" :columns="columns">
          <template #cell="{ record, column }">
            <a-checkbox
              v-if="column.key === 'select'"
              :aria-label="t('proto.selectRevision', { id: record.id })"
              :checked="selected.includes(record.id)"
              :disabled="selected.length === 2 && !selected.includes(record.id)"
              @change="(event) => select(record.id, event.target.checked)"
            />
            <template v-else-if="column.dataIndex === 'id'">
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
            <template v-else-if="column.key === 'actions'">
              <action-button
                :label="t('proto.preview')"
                :icon="EyeOutlined"
                :permission="p.version.query"
                @action="version && emit('preview', version, record.id)"
              />
              <action-button
                :label="t('proto.qualityCheck')"
                :icon="FileSearchOutlined"
                :permission="p.version.query"
                @action="qualityRevision = record"
              />
            </template>
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
  <revision-quality-drawer
    v-if="qualityRevision"
    :revision="qualityRevision"
    :allowed="open"
    @close="qualityRevision = undefined"
  />
</template>
