<script setup lang="ts">
import { computed, type PropType } from 'vue'
import {
  Tabs as ATabs,
  TabPane as ATabPane,
  Button as AButton,
  Empty as AEmpty,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { inspectCss, safeAssetUrl } from '../utils/inspect'
import { downloadSvg } from '../utils/assets'
import { copyText } from '@/shared/utils/feedback'
import PropertyList from './PropertyList.vue'
import type { InspectElement } from '../types'
const props = defineProps({
  element: { type: Object as PropType<InspectElement | null>, default: null },
})
const { t } = useI18n()
const css = computed(() => (props.element ? inspectCss(props.element) : ''))
</script>
<template>
  <aside class="inspector-panel">
    <a-empty v-if="!element" :description="t('proto.selectElement')" /><template v-else
      ><h2 class="element-title">
        {{ element.tagName }}<template v-if="element.id">#{{ element.id }}</template>
      </h2>
      <a-tabs
        ><a-tab-pane key="properties" :tab="t('proto.properties')"
          ><property-list
            :title="t('proto.position')"
            :values="{
              x: String(element.position.x),
              y: String(element.position.y),
              pageX: String(element.position.pageX),
              pageY: String(element.position.pageY),
            }"
          /><property-list
            :title="t('proto.size')"
            :values="{ width: String(element.size.width), height: String(element.size.height) }"
          /><property-list
            :title="t('proto.typography')"
            :values="element.typography"
          /><property-list
            :title="t('proto.appearance')"
            :values="element.appearance"
          /><property-list :title="t('proto.spacing')" :values="element.spacing" />
          <h3>{{ t('proto.text') }}</h3>
          <p class="code">{{ element.text }}</p></a-tab-pane
        ><a-tab-pane key="css" :tab="t('proto.css')"
          ><a-button @click="copyText(css)">{{ t('common.copy') }}</a-button>
          <pre class="code">{{ css }}</pre></a-tab-pane
        ><a-tab-pane key="html" :tab="t('proto.html')"
          ><a-button @click="copyText(element.html)">{{ t('common.copy') }}</a-button>
          <pre class="code">{{ element.html }}</pre></a-tab-pane
        ><a-tab-pane key="assets" :tab="t('proto.assets')"
          ><a-empty v-if="!element.assets.length" :description="t('common.empty')" />
          <article v-for="(asset, index) in element.assets" :key="index" class="stack">
            <template v-if="asset.url && safeAssetUrl(asset.url)"
              ><img :src="safeAssetUrl(asset.url)" :alt="t('proto.image')" class="inspect-image" />
              <p class="code">{{ asset.url }}</p>
              <a-button @click="copyText(asset.url)">{{ t('common.copy') }}</a-button></template
            ><template v-if="asset.content">
              <pre class="code">{{ asset.content }}</pre>
              <a-button @click="copyText(asset.content)">{{ t('common.copy') }}</a-button
              ><a-button @click="downloadSvg(asset.content)">{{
                t('proto.svg')
              }}</a-button></template
            >
          </article></a-tab-pane
        ></a-tabs
      ></template
    >
  </aside>
</template>
<style scoped>
.inspector-panel {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: var(--space-4);
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
}
.element-title {
  font-size: var(--text-body);
  overflow-wrap: anywhere;
}
.inspect-image {
  max-width: 100%;
  max-height: 220px;
  object-fit: contain;
}
</style>
