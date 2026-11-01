<script setup lang="ts">
import { computed, ref, type PropType } from 'vue'
import {
  Tabs as ATabs,
  TabPane as ATabPane,
  Button as AButton,
  Empty as AEmpty,
  Alert as AAlert,
  Collapse as ACollapse,
  CollapsePanel as ACollapsePanel,
} from 'ant-design-vue'
import { CopyOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { inspectCss, safeAssetUrl } from '../utils/inspect'
import { inspectToolDistance } from '../utils/inspect-tools'
import { downloadSvg } from '../utils/assets'
import { copyText } from '@/shared/utils/feedback'
import PropertyList from './PropertyList.vue'
import type {
  InspectElement,
  InspectToolState,
  InspectToolSlot,
  InspectToolTab,
  InspectToolSummary,
} from '../types'
const props = defineProps({
  element: { type: Object as PropType<InspectElement | null>, default: null },
  tools: { type: Object as PropType<InspectToolState>, required: true },
})
const emit = defineEmits<{
  tab: [tab: InspectToolTab]
  pick: [slot: InspectToolSlot]
  summary: []
  clear: []
  reconnect: []
}>()
const { t, locale } = useI18n()
const panel = ref<HTMLElement>()
const css = computed(() => (props.element ? inspectCss(props.element) : ''))
const busy = computed(() => ['connecting', 'loading', 'picking'].includes(props.tools.status))
const distance = computed(() =>
  props.tools.selections.A && props.tools.selections.B
    ? inspectToolDistance(props.tools.selections.A, props.tools.selections.B)
    : undefined,
)
const number = (value: number) =>
  new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }).format(value)
const fontCss = (font: InspectToolSummary['fonts'][number]) =>
  `font-family: ${font.family};\nfont-size: ${font.size};\nfont-weight: ${font.weight};\nline-height: ${font.lineHeight};`
function changeTab(key: string | number) {
  if (['element', 'measure', 'styles'].includes(String(key))) emit('tab', key as InspectToolTab)
}
/** Return keyboard users to their A/B control only after the drawer transition completes. */
function focusSelection() {
  if (props.tools.focusSlot)
    panel.value
      ?.querySelector<HTMLButtonElement>(`[data-inspect-pick="${props.tools.focusSlot}"]`)
      ?.focus()
}
defineExpose({ focusSelection })
</script>
<template>
  <aside ref="panel" class="inspector-panel" :aria-label="t('proto.inspectWorkspace')">
    <header class="inspector-heading">
      <h2>{{ t('proto.inspectWorkspace') }}</h2>
      <span class="muted">{{ t('proto.inspectRuntimeSnapshot') }}</span>
    </header>
    <a-alert
      v-if="tools.status === 'unavailable'"
      type="warning"
      show-icon
      :message="t('proto.inspectUnavailable')"
      ><template #action
        ><a-button size="small" @click="emit('reconnect')">{{
          t('proto.inspectReconnect')
        }}</a-button></template
      ></a-alert
    >
    <a-alert
      v-else-if="tools.status === 'stale'"
      type="warning"
      show-icon
      :message="t('proto.inspectStale')"
    />
    <p v-else-if="tools.status === 'connecting'" class="muted" role="status">
      {{ t('proto.inspectConnecting') }}
    </p>
    <p v-else-if="tools.status === 'picking'" role="status">
      {{ t('proto.inspectPicking', { slot: tools.picking }) }}
    </p>
    <a-tabs
      class="inspector-tool-tabs"
      :active-key="tools.tab"
      :tab-bar-gutter="16"
      size="small"
      @change="changeTab"
    >
      <a-tab-pane key="element" :tab="t('proto.inspectElement')">
        <a-empty v-if="!element" :description="t('proto.inspectSelectHint')" />
        <template v-else>
          <h3 class="element-title">
            {{ element.tagName }}<template v-if="element.id">#{{ element.id }}</template>
          </h3>
          <p v-if="element.className" class="muted element-class">{{ element.className }}</p>
          <a-tabs :tab-bar-gutter="16" size="small">
            <a-tab-pane key="properties" :tab="t('proto.properties')">
              <property-list
                :title="t('proto.position') + ' / ' + t('proto.size')"
                :values="{
                  x: String(element.position.x),
                  y: String(element.position.y),
                  pageX: String(element.position.pageX),
                  pageY: String(element.position.pageY),
                  width: String(element.size.width),
                  height: String(element.size.height),
                }"
              />
              <a-collapse ghost>
                <a-collapse-panel key="typography" :header="t('proto.typography')"
                  ><property-list title="" :values="element.typography"
                /></a-collapse-panel>
                <a-collapse-panel key="appearance" :header="t('proto.appearance')"
                  ><property-list title="" :values="element.appearance"
                /></a-collapse-panel>
                <a-collapse-panel key="spacing" :header="t('proto.spacing')"
                  ><property-list title="" :values="element.spacing"
                /></a-collapse-panel>
                <a-collapse-panel key="text" :header="t('proto.text')"
                  ><p class="code">{{ element.text }}</p></a-collapse-panel
                >
              </a-collapse>
            </a-tab-pane>
            <a-tab-pane key="css" :tab="t('proto.css')"
              ><a-button @click="copyText(css)">{{ t('common.copy') }}</a-button>
              <pre class="code">{{ css }}</pre>
            </a-tab-pane>
            <a-tab-pane key="html" :tab="t('proto.html')"
              ><a-button @click="copyText(element.html)">{{ t('common.copy') }}</a-button>
              <pre class="code">{{ element.html }}</pre>
            </a-tab-pane>
            <a-tab-pane key="assets" :tab="t('proto.assets')">
              <a-empty v-if="!element.assets.length" :description="t('common.empty')" />
              <article v-for="(asset, index) in element.assets" :key="index" class="stack">
                <template v-if="asset.url && safeAssetUrl(asset.url)"
                  ><img
                    :src="safeAssetUrl(asset.url)"
                    :alt="t('proto.image')"
                    class="inspect-image"
                    width="240"
                    height="160"
                    loading="lazy"
                  />
                  <p class="code">{{ asset.url }}</p>
                  <a-button @click="copyText(asset.url)">{{ t('common.copy') }}</a-button></template
                >
                <template v-if="asset.content">
                  <pre class="code">{{ asset.content }}</pre>
                  <a-button @click="copyText(asset.content)">{{ t('common.copy') }}</a-button
                  ><a-button @click="downloadSvg(asset.content)">{{
                    t('proto.svg')
                  }}</a-button></template
                >
              </article>
            </a-tab-pane>
          </a-tabs>
        </template>
      </a-tab-pane>
      <a-tab-pane key="measure" :tab="t('proto.inspectMeasure')">
        <p class="inspect-intro">{{ t('proto.inspectPickHint') }}</p>
        <section v-for="slot in ['A', 'B'] as const" :key="slot" class="inspect-selection">
          <div>
            <strong>{{ slot }}</strong
            ><span class="inspect-target">{{
              tools.selections[slot]
                ? tools.selections[slot]!.tagName +
                  (tools.selections[slot]!.id ? '#' + tools.selections[slot]!.id : '')
                : t('proto.inspectNotSelected')
            }}</span>
          </div>
          <a-button
            :data-inspect-pick="slot"
            :disabled="busy || tools.status === 'unavailable'"
            @click="emit('pick', slot)"
            >{{ t('proto.inspectPick', { slot }) }}</a-button
          >
        </section>
        <dl v-if="distance" class="inspect-distances" aria-live="polite">
          <template v-for="axis in ['horizontal', 'vertical'] as const" :key="axis"
            ><dt>
              {{ t(axis === 'horizontal' ? 'proto.inspectHorizontal' : 'proto.inspectVertical') }} ·
              {{
                t(
                  distance[axis].value === 0
                    ? 'proto.inspectTouching'
                    : distance[axis].kind === 'gap'
                      ? 'proto.inspectGap'
                      : 'proto.inspectOverlap',
                )
              }}
            </dt>
            <dd :data-inspect-axis="axis">{{ number(distance[axis].value) }} CSS px</dd></template
          >
        </dl>
        <a-button
          :disabled="busy || (!tools.selections.A && !tools.selections.B && !tools.summary)"
          @click="emit('clear')"
          >{{ t('proto.inspectClear') }}</a-button
        >
        <details class="inspect-help">
          <summary>{{ t('proto.inspectHelp') }}</summary>
          <p>{{ t('proto.inspectKeyboardHint') }}</p>
          <p>{{ t('proto.inspectRootHint') }}</p>
          <p>{{ t('proto.inspectFreshnessHint') }}</p>
        </details>
      </a-tab-pane>
      <a-tab-pane key="styles" :tab="t('proto.inspectPageStyles')">
        <div class="inspect-style-actions">
          <a-button
            type="primary"
            :loading="tools.status === 'loading'"
            :disabled="
              tools.status === 'unavailable' ||
              tools.status === 'connecting' ||
              tools.status === 'picking'
            "
            @click="emit('summary')"
            >{{
              t(tools.summary ? 'proto.inspectRefreshStyles' : 'proto.inspectReadStyles')
            }}</a-button
          ><span v-if="tools.summary" class="muted">{{
            t('proto.inspectScanned', { count: number(tools.summary.visited) })
          }}</span>
        </div>
        <p v-if="tools.status === 'loading'" role="status">{{ t('proto.inspectReading') }}</p>
        <a-empty v-else-if="!tools.summary" :description="t('proto.inspectStylesEmpty')" />
        <template v-if="tools.summary">
          <a-alert
            v-if="tools.summary.truncated"
            type="warning"
            show-icon
            :message="t('proto.inspectTruncated')"
          />
          <section class="inspect-style-section">
            <h3>
              {{ t('proto.inspectColors') }}
              <span class="muted">{{ number(tools.summary.colors.length) }}</span>
            </h3>
            <p v-if="!tools.summary.colors.length" class="muted">
              {{ t('proto.inspectNoColors') }}
            </p>
            <ul v-else class="inspect-style-list">
              <li v-for="color in tools.summary.colors" :key="color.value">
                <span
                  class="inspect-swatch"
                  :style="{ backgroundColor: color.value }"
                  aria-hidden="true"
                />
                <div>
                  <code>{{ color.value }}</code
                  ><span class="muted">{{
                    t('proto.inspectOccurrences', { count: number(color.count) })
                  }}</span>
                </div>
                <a-button
                  type="text"
                  :aria-label="t('proto.inspectCopyColor', { value: color.value })"
                  :title="t('proto.inspectCopyColor', { value: color.value })"
                  @click="copyText(color.value)"
                  ><copy-outlined aria-hidden="true"
                /></a-button>
              </li>
            </ul>
          </section>
          <section class="inspect-style-section">
            <h3>
              {{ t('proto.inspectFonts') }}
              <span class="muted">{{ number(tools.summary.fonts.length) }}</span>
            </h3>
            <p v-if="!tools.summary.fonts.length" class="muted">{{ t('proto.inspectNoFonts') }}</p>
            <ul v-else class="inspect-style-list inspect-font-list">
              <li v-for="font in tools.summary.fonts" :key="fontCss(font)">
                <div>
                  <strong>{{ font.family }}</strong
                  ><code>{{ font.size }} / {{ font.weight }} / {{ font.lineHeight }}</code
                  ><span class="muted">{{
                    t('proto.inspectTextElements', { count: number(font.count) })
                  }}</span>
                </div>
                <a-button
                  type="text"
                  :aria-label="t('proto.inspectCopyFont', { family: font.family })"
                  :title="t('proto.inspectCopyFont', { family: font.family })"
                  @click="copyText(fontCss(font))"
                  ><copy-outlined aria-hidden="true"
                /></a-button>
              </li>
            </ul>
          </section>
        </template>
        <details class="inspect-help">
          <summary>{{ t('proto.inspectHelp') }}</summary>
          <p>{{ t('proto.inspectRootHint') }}</p>
          <p>{{ t('proto.inspectStylesHint') }}</p>
          <p>{{ t('proto.inspectFreshnessHint') }}</p>
        </details>
      </a-tab-pane>
    </a-tabs>
  </aside>
</template>
<style scoped>
.inspector-panel {
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: var(--space-4);
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  overscroll-behavior: contain;
}
.inspector-heading {
  margin-bottom: var(--space-3);
}
.inspector-heading h2 {
  margin: 0 0 var(--space-1);
  font-size: var(--text-body);
  font-weight: 600;
}
.inspector-heading > span {
  font-size: var(--text-small);
}
.element-title {
  margin: var(--space-2) 0;
  font-size: var(--text-body);
  overflow-wrap: anywhere;
}
.element-class {
  font-size: var(--text-small);
  overflow-wrap: anywhere;
}
.inspect-intro,
.inspect-help {
  font-size: var(--text-small);
}
.inspect-selection {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  padding-block: var(--space-3);
  border-bottom: 1px solid var(--color-border);
}
.inspect-selection > div {
  display: flex;
  min-width: 0;
  gap: var(--space-2);
}
.inspect-target {
  min-width: 0;
  overflow-wrap: anywhere;
}
.inspect-selection :deep(.ant-btn) {
  flex: none;
}
.inspect-distances {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-3);
  margin-block: var(--space-4);
  font-variant-numeric: tabular-nums;
}
.inspect-distances dd {
  margin: 0;
  font-weight: 600;
}
.inspect-help {
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
  color: var(--color-muted);
}
.inspect-help summary {
  cursor: pointer;
  color: var(--color-text);
}
.inspect-help p {
  margin-top: var(--space-3);
  line-height: 1.6;
}
.inspect-style-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.inspect-style-actions > span {
  font-size: var(--text-small);
}
.inspect-style-section {
  margin-top: var(--space-4);
}
.inspect-style-section h3 {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-body);
}
.inspect-style-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.inspect-style-list li {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
  padding-block: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}
.inspect-style-list li > div {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: var(--space-1);
  overflow-wrap: anywhere;
  font-size: var(--text-small);
}
.inspect-style-list code {
  white-space: normal;
  overflow-wrap: anywhere;
}
.inspect-style-list .muted {
  font-variant-numeric: tabular-nums;
}
.inspect-swatch {
  width: 24px;
  height: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
.inspect-font-list li {
  grid-template-columns: minmax(0, 1fr) auto;
}
.inspect-image {
  max-width: 100%;
  max-height: 220px;
  object-fit: contain;
}
.inspector-panel :deep(.ant-alert-message) {
  overflow-wrap: anywhere;
}
.inspector-panel :deep(.ant-collapse-header) {
  padding-inline: 0;
}
.inspector-panel :deep(.ant-collapse-content-box) {
  padding-inline: 0;
}
@media (width <= 760px) {
  .inspector-heading h2 {
    display: none;
  }
}
</style>
