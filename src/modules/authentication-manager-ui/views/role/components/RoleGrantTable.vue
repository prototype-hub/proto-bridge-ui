<script setup lang="ts">
import { computed, type PropType } from 'vue'
import {
  Table as ATable,
  Checkbox as ACheckbox,
  RadioGroup as ARadioGroup,
  Radio as ARadio,
  Select as ASelect,
  Space as ASpace,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { menuDisplayName } from '@/shared/auth/menu-display'
import {
  flatGrants,
  protectedButton,
  supportsData,
  setMenuGrant,
  setAllGrants,
  setDataGrant,
  updateGrantStates,
  type GrantMenu,
} from '@/modules/authentication-manager-ui/views/role/utils/role-grants'
const props = defineProps({ menus: { type: Array as PropType<GrantMenu[]>, required: true } })
const { t, locale } = useI18n()
const rows = computed(() =>
  flatGrants(props.menus).map((row) => ({ ...row, id: String(row.menu.id) })),
)
const all = computed(
  () =>
    rows.value.length > 0 && rows.value.every(({ menu }) => menu.granted && !menu.indeterminate),
)
const partial = computed(
  () => !all.value && rows.value.some(({ menu }) => menu.granted || menu.indeterminate),
)
const hasData = computed(() => rows.value.some(({ menu }) => menu.accessSupport !== undefined))
const dataOptions = computed(() => [
  ...new Map(
    rows.value
      .flatMap(({ menu }) => menu.assetAccesses || [])
      .map((access) => [
        access.supportId,
        { value: access.supportId, label: String(access.i18nName || access.name) },
      ]),
  ).values(),
])
const columns = computed(() => [
  { title: t('identity.menuPermission'), key: 'menu', width: 300 },
  { title: t('identity.operationPermission'), key: 'buttons', width: 380 },
  ...(hasData.value ? [{ title: t('identity.dataPermission'), key: 'data', width: 380 }] : []),
])
function dataChange(menu: GrantMenu, value: unknown) {
  setDataGrant(menu, String(value))
}
function bulkData(value: unknown) {
  rows.value.forEach(({ menu }) => {
    if (supportsData(menu)) setDataGrant(menu, String(value))
  })
}
</script>
<template>
  <div class="stack">
    <a-space wrap
      ><a-checkbox
        :checked="all"
        :indeterminate="partial"
        @change="setAllGrants(menus, $event.target.checked)"
        >{{ t('identity.selectAll') }}</a-checkbox
      ><a-select
        v-if="hasData"
        :placeholder="t('identity.bulkData')"
        :options="dataOptions"
        style="min-width: 220px"
        @change="bulkData"
    /></a-space>
    <a-table
      :columns="columns"
      :data-source="rows"
      :pagination="false"
      row-key="id"
      :scroll="{ x: hasData ? 1100 : 680, y: '55vh' }"
      ><template #bodyCell="{ column, record }">
        <a-checkbox
          v-if="column.key === 'menu'"
          :checked="!!record.menu.granted"
          :indeterminate="!!record.menu.indeterminate"
          :disabled="record.menu.code === 'account-center'"
          :style="{ marginLeft: `${record.depth * 20}px` }"
          @change="setMenuGrant(menus, record.menu, $event.target.checked)"
          >{{ menuDisplayName(record.menu, locale) }}</a-checkbox
        >
        <a-space v-else-if="column.key === 'buttons'" wrap
          ><a-checkbox
            v-for="button in record.menu.buttons"
            :key="button.id"
            v-model:checked="button.granted"
            :disabled="protectedButton(record.menu, button)"
            @change="updateGrantStates(menus)"
            >{{ button.i18nName || button.name }}</a-checkbox
          ></a-space
        >
        <template v-else-if="column.key === 'data'"
          ><a-radio-group
            v-if="supportsData(record.menu)"
            :value="
              record.menu.assetAccesses?.find((access: { granted?: boolean }) => access.granted)
                ?.supportId
            "
            @change="dataChange(record.menu, $event.target.value)"
            ><a-radio
              v-for="access in record.menu.assetAccesses"
              :key="access.supportId"
              :value="access.supportId"
              >{{ access.i18nName || access.name }}</a-radio
            ></a-radio-group
          ><span v-else>{{
            record.menu.accessDescription || t('identity.noDataPermission')
          }}</span></template
        >
      </template></a-table
    >
  </div>
</template>
