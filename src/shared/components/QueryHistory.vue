<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Alert as AAlert,
  Button as AButton,
  ButtonGroup as AButtonGroup,
  Dropdown as ADropdown,
  Empty as AEmpty,
  Input as AInput,
  Menu as AMenu,
  MenuItem as AMenuItem,
  Modal as AModal,
  Popconfirm as APopconfirm,
} from 'ant-design-vue'
import { DownOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { Query, QueryDraft, QueryField } from '@/shared/api/types'
import { parseDraft, serializeDraft } from '@/shared/utils/query-model'
import { useQueryHistory } from '@/shared/composables/useQueryHistory'

const props = withDefaults(
  defineProps<{ query: Query; fields?: QueryField[]; target?: string }>(),
  { fields: () => [], target: '' },
)
const emit = defineEmits<{ apply: [query: QueryDraft]; search: [] }>()
const { t } = useI18n()
const history = useQueryHistory(() => props.target)
const selected = ref(''),
  open = ref(false),
  name = ref(''),
  localError = ref('')
const selectedName = computed(
  () => history.rows.value.find((row) => row.id === selected.value)?.name,
)
const error = computed(() => localError.value || history.actionError.value || history.error.value)
watch(history.target, () => {
  selected.value = ''
  open.value = false
  name.value = ''
  localError.value = ''
})
watch(history.rows, (rows) => {
  if (selected.value && !rows.some((row) => row.id === selected.value)) selected.value = ''
})
function beginSave() {
  localError.value = ''
  history.actionError.value = ''
  open.value = true
}
async function save() {
  const trimmed = name.value.trim()
  if (!trimmed || trimmed.length > 64) {
    localError.value = t(trimmed ? 'system.queryNameTooLong' : 'common.required')
    return
  }
  localError.value = ''
  if (await history.save(trimmed, JSON.stringify(serializeDraft(props.query)))) {
    open.value = false
    name.value = ''
  }
}
function apply(id: string) {
  const row = history.rows.value.find((row) => row.id === id)
  if (!row) return
  const query = parseDraft(row.content, props.fields)
  if (!query) {
    localError.value = t('common.invalid')
    return
  }
  localError.value = ''
  selected.value = id
  emit('apply', query)
}
async function remove() {
  if (await history.remove(selected.value)) selected.value = ''
}
function retry() {
  localError.value = ''
  void history.load()
}
</script>
<template>
  <div class="query-history" :aria-busy="history.loading.value || history.busy.value">
    <div class="query-history-actions">
      <a-button
        class="query-save"
        :aria-label="t('system.savingQuery')"
        :disabled="history.busy.value"
        @click="beginSave"
        >{{ t('common.save') }}</a-button
      >
      <a-button-group>
        <a-button type="primary" :aria-label="t('system.searchQuery')" @click="emit('search')">{{
          t('system.searchQuery')
        }}</a-button>
        <a-dropdown
          :trigger="['click']"
          placement="bottomLeft"
          :disabled="history.loading.value || history.busy.value"
        >
          <a-button
            type="primary"
            class="query-history-trigger"
            :aria-label="t('system.searchRecords')"
            :loading="history.loading.value"
            ><template #icon><down-outlined /></template
          ></a-button>
          <template #overlay>
            <a-menu
              v-if="history.rows.value.length"
              class="query-history-menu"
              :selected-keys="selected ? [selected] : []"
              @click="apply(String($event.key))"
              ><a-menu-item v-for="row in history.rows.value" :key="row.id">{{
                row.name
              }}</a-menu-item></a-menu
            >
            <div v-else class="query-history-menu query-history-empty" role="menu">
              <a-empty
                :description="t('system.noQueryHistory')"
                :image="AEmpty.PRESENTED_IMAGE_SIMPLE"
              />
            </div>
          </template>
        </a-dropdown>
      </a-button-group>
      <a-popconfirm v-if="selectedName" :title="t('common.confirmDelete')" @confirm="remove"
        ><a-button
          type="text"
          danger
          :disabled="history.busy.value"
          :aria-label="t('system.deleteQueryRecord')"
          :title="selectedName"
          ><template #icon><delete-outlined /></template>{{ t('common.delete') }}</a-button
        ></a-popconfirm
      >
    </div>
    <span v-if="history.loading.value" class="query-history-loading" role="status">{{
      t('system.loadingQueryHistory')
    }}</span>
    <a-alert
      v-if="error && !open"
      class="query-history-error"
      type="error"
      :message="error"
      show-icon
      ><template #action
        ><a-button size="small" @click="retry">{{ t('common.retry') }}</a-button></template
      ></a-alert
    >
    <a-modal
      v-model:open="open"
      :title="t('system.savingQuery')"
      :confirm-loading="history.busy.value"
      :ok-button-props="{ disabled: !name.trim() || name.trim().length > 64 }"
      @ok="save"
    >
      <a-input
        v-model:value="name"
        :aria-label="t('common.name')"
        :placeholder="t('common.name')"
        :maxlength="64"
        show-count
        @press-enter="save"
      />
      <a-alert v-if="error" type="error" :message="error" show-icon />
    </a-modal>
  </div>
</template>
<style scoped>
.query-history {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.query-history-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4);
}
.query-save {
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.query-history-loading {
  color: var(--color-muted);
  font-size: 12px;
}
.query-history-error {
  max-width: 100%;
  min-width: 0;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.query-history-error :deep(.ant-alert-content) {
  min-width: 0;
  overflow-wrap: anywhere;
}
.query-history-error :deep(.ant-alert-action) {
  margin-left: auto;
}
.query-history-empty {
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}
</style>
