<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import {
  Button as AButton,
  Input as AInput,
  Select as ASelect,
  TreeSelect as ATreeSelect,
  Pagination as APagination,
} from 'ant-design-vue'
import { ArrowLeftOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import DesignTokenIssues from './DesignTokenIssues.vue'
import {
  filterDesignTokens,
  tokenJson,
  tokenPathKey,
  tokenPathLabel,
} from '../utils/design-token-package'
import type { DesignTokenDocument } from '../types/design-token-package'

const props = defineProps<{
  document: DesignTokenDocument
  loading?: boolean
  preview?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ inputs: [value: Record<string, string>] }>()
const { t } = useI18n()
const query = reactive({ keyword: '', group: '', set: '', type: '*' })
const page = ref(1),
  selectedPointer = ref<string>(),
  mobileDetail = ref(false)
const detailHeading = ref<HTMLElement>(),
  resultsHeading = ref<HTMLElement>()
const filtered = computed(() => filterDesignTokens(props.document, query))
const visible = computed(() => filtered.value.slice((page.value - 1) * 25, page.value * 25))
const selected = computed(() =>
  props.document.tokens.find((item) => item.pointer === selectedPointer.value),
)
const selectedGroup = computed(() =>
  props.document.groups.find((item) => tokenPathKey(item.path) === query.group),
)
const selectedSet = computed(() => props.document.sets.find((item) => item.name === query.set))
const typeOptions = computed(() => [
  { value: '*', label: t('proto.tokenAllTypes') },
  ...[...new Set(props.document.tokens.map((item) => item.type || ''))]
    .sort()
    .map((type) => ({ value: type, label: type || t('proto.tokenUnknownType') })),
])
type GroupNode = { title: string; value: string; key: string; children: GroupNode[] }
const groupTree = computed(() => {
  const nodes = new Map<string, GroupNode>(),
    roots: GroupNode[] = []
  function ensure(path: string[]): GroupNode {
    const key = tokenPathKey(path),
      existing = nodes.get(key)
    if (existing) return existing
    const node: GroupNode = { title: tokenPathLabel(path) || '/', value: key, key, children: [] }
    nodes.set(key, node)
    if (path.length > 1) ensure(path.slice(0, -1)).children.push(node)
    else roots.push(node)
    return node
  }
  props.document.groups.forEach((group) => ensure(group.path))
  return roots
})
const setOptions = computed(() => [
  { value: '', label: t('proto.tokenAllSets') },
  ...props.document.sets.map((set) => ({ value: set.name, label: set.name })),
])
watch(query, () => {
  page.value = 1
})
watch(
  () => props.document,
  () => {
    if (!selected.value) {
      selectedPointer.value = undefined
      mobileDetail.value = false
    }
    page.value = Math.min(page.value, Math.max(1, Math.ceil(filtered.value.length / 25)))
  },
)
function popupContainer(trigger: HTMLElement) {
  return trigger.closest<HTMLElement>('.token-workspace') || trigger.parentElement!
}
function context(name: string, value: unknown) {
  if (typeof value !== 'string' || props.preview || props.loading || props.disabled) return
  // Object.fromEntries keeps arbitrary modifier names as own data properties, including __proto__.
  emit(
    'inputs',
    Object.fromEntries([
      ...Object.entries(props.document.inputs).filter(([key]) => key !== name),
      [name, value],
    ]),
  )
}
async function select(pointer: string) {
  selectedPointer.value = pointer
  mobileDetail.value = true
  await nextTick()
  detailHeading.value?.focus()
}
async function backTokens() {
  mobileDetail.value = false
  await nextTick()
  resultsHeading.value?.focus()
}
async function follow(path: string[] | null) {
  if (!path) return
  const target = props.document.tokens.find(
    (item) => tokenPathKey(item.path) === tokenPathKey(path),
  )
  if (target) await select(target.pointer)
}
function canFollow(path: string[] | null) {
  return (
    !!path && props.document.tokens.some((item) => tokenPathKey(item.path) === tokenPathKey(path))
  )
}
</script>
<template>
  <div class="token-explorer" :data-token-detail="mobileDetail" :aria-busy="loading">
    <div v-if="preview" class="token-preview-summary">
      <strong>{{
        t('proto.tokenSummary', { tokens: document.tokenCount, groups: document.groupCount })
      }}</strong>
      <span
        >DTCG {{ document.standardVersion }} · {{ t('proto.tokenValidator') }}
        {{ document.validatorVersion }}</span
      >
    </div>
    <section
      v-if="document.modifiers.length"
      class="token-contexts"
      :aria-label="t('proto.tokenPreviewContext')"
    >
      <label v-for="modifier in document.modifiers" :key="modifier.name">
        <span>{{ t('proto.tokenContext', { name: modifier.name }) }}</span>
        <a-select
          :value="
            Object.hasOwn(document.inputs, modifier.name)
              ? document.inputs[modifier.name]
              : undefined
          "
          :options="modifier.contexts.map((value) => ({ value, label: value }))"
          :aria-label="t('proto.tokenContext', { name: modifier.name })"
          :get-popup-container="popupContainer"
          :disabled="preview || loading || disabled"
          @change="context(modifier.name, $event)"
        />
        <small>{{
          modifier.defaultContext === null
            ? t('proto.tokenNoDefault')
            : t('proto.tokenDefaultContext', { context: modifier.defaultContext })
        }}</small>
        <span v-if="modifier.description" class="token-muted">{{ modifier.description }}</span>
      </label>
    </section>
    <design-token-issues
      :report="document"
      :label="t(preview ? 'proto.tokenValidation' : 'proto.tokenViewValidation')"
    />
    <div class="token-explorer-body">
      <section class="token-results-pane">
        <div class="token-filters">
          <a-input
            v-model:value="query.keyword"
            :aria-label="t('proto.tokenSearch')"
            :placeholder="t('proto.tokenSearch')"
            :maxlength="160"
            allow-clear
          />
          <a-tree-select
            :value="query.group || undefined"
            :tree-data="groupTree"
            :placeholder="t('proto.tokenAllGroups')"
            :aria-label="t('proto.tokenGroups')"
            :get-popup-container="popupContainer"
            allow-clear
            show-search
            tree-node-filter-prop="title"
            @change="query.group = typeof $event === 'string' ? $event : ''"
          />
          <a-select
            v-if="document.sets.length"
            v-model:value="query.set"
            :options="setOptions"
            :aria-label="t('proto.tokenSets')"
            :get-popup-container="popupContainer"
          />
          <a-select
            v-model:value="query.type"
            :options="typeOptions"
            :aria-label="t('proto.tokenType')"
            :get-popup-container="popupContainer"
          />
        </div>
        <details v-if="selectedGroup || selectedSet" class="token-group-info">
          <summary>
            {{ selectedGroup ? tokenPathLabel(selectedGroup.path) || '/' : selectedSet?.name }}
          </summary>
          <p v-if="selectedGroup?.description || selectedSet?.description">
            {{ selectedGroup?.description || selectedSet?.description }}
          </p>
          <pre v-if="selectedGroup?.extensions" tabindex="0">{{
            tokenJson(selectedGroup.extensions)
          }}</pre>
        </details>
        <div ref="resultsHeading" class="token-result-heading" tabindex="-1">
          <strong>{{ t('proto.tokenResults', { count: filtered.length }) }}</strong
          ><span>{{ t('proto.tokenType') }}</span>
        </div>
        <div v-if="!visible.length" class="token-empty">
          {{ t(document.tokens.length ? 'proto.tokenNoResults' : 'proto.tokenNoTokens') }}
        </div>
        <ul v-else class="token-results">
          <li v-for="item in visible" :key="item.pointer">
            <button
              type="button"
              :aria-pressed="selectedPointer === item.pointer"
              @click="select(item.pointer)"
            >
              <span
                ><strong>{{ item.name }}</strong
                ><code>{{ tokenPathLabel(item.path) }}</code></span
              ><span class="token-type">{{ item.type || t('proto.tokenUnknownType') }}</span>
            </button>
          </li>
        </ul>
        <a-pagination
          v-if="filtered.length > 25"
          :current="page"
          :total="filtered.length"
          :page-size="25"
          :show-size-changer="false"
          simple
          @change="page = $event"
        />
      </section>
      <section v-if="selected" class="token-value-pane" :aria-labelledby="'token-detail-heading'">
        <a-button class="token-mobile-back" @click="backTokens"
          ><arrow-left-outlined aria-hidden="true" />{{ t('proto.tokenBackTokens') }}</a-button
        >
        <h3 id="token-detail-heading" ref="detailHeading" tabindex="-1">{{ selected.name }}</h3>
        <code>{{ tokenPathLabel(selected.path) }}</code>
        <p v-if="selected.description">{{ selected.description }}</p>
        <dl>
          <dt>{{ t('proto.tokenType') }}</dt>
          <dd>{{ selected.type || t('proto.tokenUnknownType') }}</dd>
          <dt>{{ t('proto.tokenPointer') }}</dt>
          <dd>
            <code>{{ selected.pointer }}</code>
          </dd>
        </dl>
        <h4>{{ t('proto.tokenDeclared') }}</h4>
        <pre tabindex="0">{{ tokenJson(selected.declaredValue) }}</pre>
        <h4>{{ t('proto.tokenResolved') }}</h4>
        <pre tabindex="0">{{ tokenJson(selected.resolvedValue) }}</pre>
        <template v-if="selected.aliases.length"
          ><h4>{{ t('proto.tokenReferences') }}</h4>
          <ul class="token-aliases">
            <li v-for="(alias, index) in selected.aliases" :key="`${alias.reference}:${index}`">
              <a-button
                v-if="canFollow(alias.targetPath)"
                type="link"
                @click="follow(alias.targetPath)"
                >{{ alias.reference }}</a-button
              ><code v-else>{{ alias.reference }}</code
              ><span>{{ t(`proto.tokenReference_${alias.status}`) }}</span>
            </li>
          </ul></template
        >
        <template v-if="selected.extensions !== null && selected.extensions !== undefined"
          ><h4>{{ t('proto.tokenExtensions') }}</h4>
          <pre tabindex="0">{{ tokenJson(selected.extensions) }}</pre>
        </template>
        <template
          v-if="
            selected.deprecated !== null &&
            selected.deprecated !== undefined &&
            selected.deprecated !== false
          "
          ><h4>{{ t('proto.tokenDeprecated') }}</h4>
          <pre tabindex="0">{{ tokenJson(selected.deprecated) }}</pre>
        </template>
      </section>
    </div>
  </div>
</template>
<style scoped>
.token-explorer {
  display: grid;
  gap: var(--space-6);
  min-width: 0;
}
.token-preview-summary {
  display: grid;
  gap: var(--space-1);
}
.token-preview-summary span {
  color: var(--color-muted);
  font-size: var(--text-small);
}
.token-contexts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}
.token-contexts label {
  display: grid;
  gap: var(--space-1);
  min-width: 180px;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.token-contexts small,
.token-muted,
.token-type {
  color: var(--color-muted);
}
.token-explorer-body {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(260px, 0.85fr);
  min-width: 0;
}
.token-results-pane {
  min-width: 0;
}
.token-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.token-filters > :first-child {
  grid-column: 1 / -1;
}
.token-filters > * {
  min-width: 0;
}
.token-results strong {
  overflow-wrap: anywhere;
}
.token-group-info {
  margin-bottom: var(--space-3);
  overflow-wrap: anywhere;
}
.token-result-heading {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding-bottom: var(--space-2);
  color: var(--color-muted);
}
.token-results,
.token-aliases {
  list-style: none;
  margin: 0;
  padding: 0;
}
.token-results {
  margin-bottom: var(--space-4);
}
.token-results li {
  border-top: 1px solid var(--color-border);
}
.token-results button {
  border: 0;
  background: transparent;
  width: 100%;
  padding: var(--space-3) var(--space-2);
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  text-align: start;
  cursor: pointer;
  color: var(--color-text);
  border-radius: var(--radius);
}
.token-results button > span:first-child {
  display: grid;
  min-width: 0;
  gap: var(--space-1);
}
.token-results button:hover {
  background: var(--color-background);
}
.token-results button[aria-pressed='true'] {
  background: var(--color-background);
  color: var(--color-primary);
}
.token-results code {
  font-size: var(--text-small);
  overflow-wrap: anywhere;
}
.token-type {
  font-size: var(--text-small);
  flex-shrink: 0;
}
.token-value-pane {
  min-width: 0;
  margin-inline-start: var(--space-6);
  padding-inline-start: var(--space-6);
  border-inline-start: 1px solid var(--color-border);
}
h3 {
  font-size: 18px;
  margin: 0 0 var(--space-2);
  overflow-wrap: anywhere;
}
h4 {
  font-size: var(--text-body);
  margin: var(--space-6) 0 var(--space-2);
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2) var(--space-3);
}
dt {
  color: var(--color-muted);
}
dd {
  margin: 0;
  min-width: 0;
}
pre {
  background: var(--color-background);
  padding: var(--space-3);
  border-radius: var(--radius);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 320px;
  overflow: auto;
  margin: 0;
}
code,
p {
  overflow-wrap: anywhere;
}
.token-aliases li {
  display: grid;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}
.token-aliases .ant-btn {
  height: auto;
  padding: 0;
  justify-content: start;
  text-align: start;
  white-space: normal;
  overflow-wrap: anywhere;
}
.token-aliases span {
  color: var(--color-muted);
  font-size: var(--text-small);
}
.token-empty {
  padding: var(--space-8) var(--space-2);
  color: var(--color-muted);
}
.token-mobile-back {
  display: none;
}
@media (max-width: 1000px) {
  .token-explorer-body {
    grid-template-columns: 1fr;
  }
  .token-value-pane {
    margin: var(--space-6) 0 0;
    padding: var(--space-6) 0 0;
    border-inline-start: 0;
    border-top: 1px solid var(--color-border);
  }
}
@media (max-width: 600px) {
  .token-contexts {
    display: grid;
  }
  .token-contexts label {
    min-width: 0;
  }
  .token-explorer[data-token-detail='true'] > .token-contexts,
  .token-explorer[data-token-detail='true'] > .token-preview-summary,
  .token-explorer[data-token-detail='true'] > .token-report,
  .token-explorer[data-token-detail='true'] .token-results-pane,
  .token-explorer[data-token-detail='false'] .token-value-pane {
    display: none;
  }
  .token-value-pane {
    margin: 0;
    padding: 0;
    border: 0;
  }
  .token-mobile-back {
    display: inline-flex;
    margin-bottom: var(--space-4);
  }
  .token-type {
    max-width: 100px;
    overflow-wrap: anywhere;
  }
}
</style>
