<script setup lang="ts">
import { computed, type PropType } from 'vue'
import {
  InputSearch as AInputSearch,
  Tree as ATree,
  Space as ASpace,
  Button as AButton,
  Popconfirm as APopconfirm,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
const props = defineProps({
  groups: { type: Array as PropType<SystemRecord[]>, required: true },
  selected: { type: String, default: '' },
  admin: Boolean,
})
const search = defineModel<string>('search', { default: '' })
const emit = defineEmits<{
  select: [id: string]
  search: []
  edit: [row?: SystemRecord]
  remove: [id: string]
}>()
const { t } = useI18n()
const tree = computed(() => [
  {
    key: 'global_role',
    id: 'global_role',
    name: t('identity.allRoles'),
    children: props.groups.map((row) => ({
      key: row.id,
      id: row.id,
      name: row.name,
      i18nName: row.i18nName,
    })),
  },
])
</script>
<template>
  <div class="stack">
    <a-input-search
      v-model:value="search"
      :placeholder="t('common.name')"
      @search="emit('search')"
    />
    <a-button v-if="admin" type="primary" block @click="emit('edit')">{{
      t('identity.addGroup')
    }}</a-button>
    <a-tree
      :tree-data="tree"
      :field-names="{ title: 'name', key: 'id' }"
      :default-expanded-keys="['global_role']"
      :selected-keys="[selected || 'global_role']"
      block-node
      :show-line="{ showLeafIcon: false }"
      @select="(keys) => emit('select', keys[0] === 'global_role' ? '' : String(keys[0] || ''))"
      ><template #title="record"
        ><div class="group-row">
          <span>{{ record.i18nName || record.name }}</span
          ><a-space
            v-if="admin && record.id !== 'global_role' && record.id !== 'default_group'"
            @click.stop
            ><a-button
              type="text"
              size="small"
              @click="emit('edit', { id: String(record.id), name: String(record.name) })"
              >{{ t('common.edit') }}</a-button
            ><a-popconfirm :title="t('common.confirmDelete')" @confirm="emit('remove', record.id)"
              ><a-button type="text" size="small" danger>{{
                t('common.delete')
              }}</a-button></a-popconfirm
            ></a-space
          >
        </div></template
      ></a-tree
    >
  </div>
</template>
<style scoped>
.group-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
</style>
