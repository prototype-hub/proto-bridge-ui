<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import {
  Alert as AAlert,
  Button as AButton,
  Modal,
  Pagination as APagination,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useSession } from '@/app/stores/session'
import { useDeliveryDocument } from '../hooks/useDeliveryDocument'
import type { Project, Revision, WorkspaceContext } from '../types'
import type {
  DeliverySourceRef,
  DeliveryMaterialRef,
  DeliveryImageRef,
} from '../types/delivery-document'
const props = defineProps<{ project: Project; revision: Revision; context: WorkspaceContext }>()
const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n(),
  session = useSession()
const scope = computed(() =>
  session.user?.id
    ? {
        actorId: session.user.id,
        project: props.project,
        revision: props.revision,
        context: props.context,
      }
    : undefined,
)
const state = useDeliveryDocument(scope, locale)
const root = ref<HTMLElement>(),
  step = ref(0),
  search = ref('')
const [modal, ModalContextHolder] = Modal.useModal()
const steps = ['documentSources', 'documentEdit', 'documentPreview'] as const
const sourceKinds = ['descriptions', 'materials', 'images', 'checks'] as const
const selectedSources = computed(() =>
  sourceKinds.flatMap((kind) =>
    (state.active.value?.[kind] || []).map((source) => ({ ...source, kind })),
  ),
)
const filteredPages = computed(() =>
  state.pages.value.filter((page) =>
    `${page.name} ${page.path}`.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
  ),
)
const activeName = computed(
  () => state.pages.value.find((page) => page.pageId === state.selectedId.value)?.name || '',
)
const imageMaterials = computed(
  () =>
    state.materials.value?.data.filter(
      (row) =>
        row.materialType === 'image' && ['image/png', 'image/jpeg'].includes(row.mediaType || ''),
    ) || [],
)
function label(id: string) {
  return state.labels[id] || id
}
function chosen(kind: 'descriptions' | 'materials' | 'images' | 'checks', id: string) {
  return state.active.value?.[kind].some((ref) => ref.id === id) || false
}
function toggle(
  kind: 'descriptions' | 'materials' | 'images' | 'checks',
  row: { id: string; configVersion: number },
  checked: boolean,
) {
  const page = state.active.value
  if (!page || state.busy.value) return
  if (!checked) {
    page[kind] = page[kind].filter((ref) => ref.id !== row.id) as DeliverySourceRef[] &
      DeliveryMaterialRef[] &
      DeliveryImageRef[]
  } else if (!chosen(kind, row.id)) {
    const value = { id: row.id, expectedVersion: row.configVersion }
    if (kind === 'materials') page.materials.push({ ...value, includeText: false })
    else if (kind === 'images') page.images.push({ ...value, caption: '' })
    else page[kind].push(value)
  }
  state.changed.value = true
}
function pageChange(kind: 'descriptions' | 'materials' | 'checks', page: number) {
  state.indexes[kind] = page - 1
  void state.loadSources()
}
async function remove(pageId: string) {
  state.removePage(pageId)
  await nextTick()
  const current = root.value?.querySelector<HTMLElement>('.document-page-name[aria-current]')
  ;(current || root.value?.querySelector<HTMLElement>('[data-document-heading]'))?.focus()
}
async function go(index: number) {
  step.value = index
  if (index === 2) void state.loadImages()
  await nextTick()
  root.value?.querySelector<HTMLElement>('[data-document-heading]')?.focus()
}
function confirm(title: string, content: string, okText: string): Promise<boolean> {
  return new Promise((resolve) =>
    modal.confirm({
      zIndex: 1100,
      title,
      content,
      okText,
      cancelText: t('proto.documentKeep'),
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  )
}
async function assemble() {
  if (
    state.assembled.value &&
    !(await confirm(
      t('proto.documentReassembleTitle'),
      t('proto.documentReassembleHint'),
      t('proto.documentReassembleConfirm'),
    ))
  )
    return
  await state.assemble(state.assembled.value || state.conflict.value)
  if (state.assembled.value && !state.error.value) await go(1)
}
async function canLeave() {
  if (state.busy.value) {
    state.error.value = t('proto.documentBusy')
    return false
  }
  return (
    !state.changed.value ||
    (await confirm(
      t('proto.documentDiscardTitle'),
      t('proto.documentDiscardHint'),
      t('proto.documentDiscard'),
    ))
  )
}
async function close() {
  if (await canLeave()) emit('close')
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void close()
    return
  }
  if (event.key !== 'Tab' || !root.value) return
  const elements = [
    ...root.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
    ),
  ].filter((element) => element.getClientRects().length)
  const first = elements[0],
    last = elements.at(-1)
  if (!elements.includes(document.activeElement as HTMLElement)) {
    event.preventDefault()
    ;(event.shiftKey ? last : first)?.focus()
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (state.changed.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => {
  void nextTick(() => root.value?.querySelector<HTMLElement>('[data-document-heading]')?.focus())
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
onBeforeRouteLeave(canLeave)
onBeforeRouteUpdate(async () => {
  if (!(await canLeave())) return false
  // Same-route page navigation keeps the parent mounted, so explicitly end this session.
  emit('close')
  return true
})
defineExpose({ canLeave })
</script>
<template>
  <div class="delivery-document-overlay">
    <section
      ref="root"
      class="delivery-document"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-document-title"
      @keydown="keydown"
    >
      <header class="document-header">
        <div>
          <h1 id="delivery-document-title" tabindex="-1" data-document-heading>
            {{ t('proto.deliveryDocument') }}
          </h1>
          <p>
            {{
              t('proto.documentScope', {
                version: `${project.name} / ${context.versionName}`,
                revision: revision.id,
              })
            }}
          </p>
        </div>
        <a-button :aria-label="t('proto.documentClose')" @click="close">×</a-button>
      </header>
      <nav class="document-steps" :aria-label="t('proto.deliveryDocument')">
        <button
          v-for="(name, index) in steps"
          :key="name"
          type="button"
          :aria-current="step === index ? 'step' : undefined"
          :disabled="index > 0 && !state.assembled.value"
          @click="go(index)"
        >
          <span aria-hidden="true">{{ index + 1 }}</span
          >{{ t(`proto.${name}`) }}
        </button>
      </nav>
      <a-alert
        v-if="state.error.value"
        class="document-alert"
        role="alert"
        :type="state.conflict.value ? 'warning' : 'error'"
        :message="state.error.value"
        show-icon
        ><template v-if="!state.denied.value && !state.conflict.value && step === 0" #action
          ><a-button @click="state.loadSources()">{{ t('common.retry') }}</a-button></template
        ></a-alert
      >
      <a-alert
        v-else-if="state.document.pages.length && !state.valid.value"
        class="document-alert"
        type="warning"
        :message="t('proto.documentLimits')"
        show-icon
      />
      <a-alert
        v-else-if="state.assembled.value && state.needsAssembly.value"
        class="document-alert"
        type="warning"
        :message="t('proto.documentNeedsAssembly')"
        show-icon
      />
      <div v-if="state.available.value" class="document-layout">
        <aside class="document-pages" :aria-label="t('proto.documentPages')">
          <h2>
            {{ t('proto.documentPages') }} <span>{{ state.document.pages.length }}/50</span>
          </h2>
          <ol class="document-sequence">
            <li
              v-for="(page, index) in state.document.pages"
              :key="page.pageId"
              :class="{ selected: state.selectedId.value === page.pageId }"
            >
              <button
                type="button"
                class="document-page-name"
                :aria-current="state.selectedId.value === page.pageId ? 'true' : undefined"
                :disabled="state.busy.value"
                @click="state.selectPage(page.pageId)"
              >
                {{ state.pages.value.find((item) => item.pageId === page.pageId)?.name }}
              </button>
              <div class="document-page-actions">
                <button
                  type="button"
                  :aria-label="
                    t('proto.documentUp', {
                      page: state.pages.value.find((item) => item.pageId === page.pageId)?.name,
                    })
                  "
                  :disabled="index === 0 || state.busy.value"
                  @click="state.move(page.pageId, -1)"
                >
                  ↑</button
                ><button
                  type="button"
                  :aria-label="
                    t('proto.documentDown', {
                      page: state.pages.value.find((item) => item.pageId === page.pageId)?.name,
                    })
                  "
                  :disabled="index === state.document.pages.length - 1 || state.busy.value"
                  @click="state.move(page.pageId, 1)"
                >
                  ↓</button
                ><button
                  type="button"
                  :aria-label="
                    t('proto.documentRemove', {
                      page: state.pages.value.find((item) => item.pageId === page.pageId)?.name,
                    })
                  "
                  :disabled="state.busy.value"
                  @click="remove(page.pageId)"
                >
                  ×
                </button>
              </div>
            </li>
          </ol>
          <template v-if="step === 0"
            ><label for="document-page-search">{{ t('proto.documentAddPage') }}</label
            ><input
              id="document-page-search"
              v-model="search"
              type="search"
              :placeholder="t('proto.documentFindPages')"
            />
            <ul class="document-available-pages">
              <li v-for="page in filteredPages" :key="page.pageId">
                <label
                  ><input
                    type="checkbox"
                    :checked="state.document.pages.some((item) => item.pageId === page.pageId)"
                    :disabled="
                      state.busy.value ||
                      (!state.document.pages.some((item) => item.pageId === page.pageId) &&
                        state.document.pages.length >= 50)
                    "
                    @change="
                      ($event.target as HTMLInputElement).checked
                        ? state.selectPage(page.pageId)
                        : state.removePage(page.pageId)
                    "
                  /><span
                    >{{ page.name }}<small>{{ page.path }}</small></span
                  ></label
                >
              </li>
            </ul>
            <p v-if="!filteredPages.length">{{ t('proto.documentNoPageMatches') }}</p></template
          >
        </aside>
        <main class="document-main" :aria-busy="state.busy.value || state.loading.value">
          <template v-if="step === 0">
            <div v-if="!state.active.value" class="document-empty">
              <h2>{{ t('proto.documentNoPages') }}</h2>
              <p>{{ t('proto.documentSelectPage') }}</p>
            </div>
            <template v-else
              ><h2 tabindex="-1" data-document-heading>{{ activeName }}</h2>
              <p v-if="state.loading.value" role="status">{{ t('proto.documentLoading') }}</p>
              <fieldset :disabled="state.busy.value || state.loading.value">
                <legend>{{ t('proto.documentDescriptions') }}</legend>
                <p v-if="!state.descriptions.value?.total">{{ t('proto.documentNoSources') }}</p>
                <label
                  v-for="row in state.descriptions.value?.data"
                  :key="row.id"
                  class="document-source"
                  ><input
                    type="checkbox"
                    :checked="chosen('descriptions', row.id)"
                    @change="
                      toggle('descriptions', row, ($event.target as HTMLInputElement).checked)
                    "
                  /><span
                    >{{ row.title }}<small>{{ row.purpose }}</small></span
                  ></label
                ><a-pagination
                  v-if="(state.descriptions.value?.total || 0) > 20"
                  size="small"
                  :current="state.indexes.descriptions + 1"
                  :total="state.descriptions.value?.total"
                  :page-size="20"
                  :show-size-changer="false"
                  @change="pageChange('descriptions', $event)"
                />
              </fieldset>
              <fieldset :disabled="state.busy.value || state.loading.value">
                <legend>{{ t('proto.documentMaterials') }}</legend>
                <p class="document-note">{{ t('proto.documentMaterialAssignment') }}</p>
                <p v-if="!state.materials.value?.total">{{ t('proto.documentNoMaterials') }}</p>
                <div
                  v-for="row in state.materials.value?.data"
                  :key="row.id"
                  class="document-material"
                >
                  <label class="document-source"
                    ><input
                      type="checkbox"
                      :checked="chosen('materials', row.id)"
                      @change="
                        toggle('materials', row, ($event.target as HTMLInputElement).checked)
                      "
                    /><span
                      >{{ row.fileName || row.sourceName || row.id
                      }}<small>{{ row.sourceTool || row.materialType }}</small></span
                    ></label
                  ><label
                    v-if="chosen('materials', row.id) && row.textStatus === 'READY'"
                    class="document-subchoice"
                    ><input
                      v-model="
                        state.active.value.materials.find((ref) => ref.id === row.id)!.includeText
                      "
                      type="checkbox"
                      @change="state.changed.value = true"
                    />{{ t('proto.documentIncludeText') }}</label
                  >
                </div>
                <a-pagination
                  v-if="(state.materials.value?.total || 0) > 20"
                  size="small"
                  :current="state.indexes.materials + 1"
                  :total="state.materials.value?.total"
                  :page-size="20"
                  :show-size-changer="false"
                  @change="pageChange('materials', $event)"
                />
              </fieldset>
              <fieldset :disabled="state.busy.value || state.loading.value">
                <legend>{{ t('proto.documentImages') }}</legend>
                <p class="document-note">{{ t('proto.documentImageHint') }}</p>
                <div v-for="row in imageMaterials" :key="row.id">
                  <label class="document-source"
                    ><input
                      type="checkbox"
                      :checked="chosen('images', row.id)"
                      @change="toggle('images', row, ($event.target as HTMLInputElement).checked)"
                    /><span>{{ row.fileName || row.sourceName || row.id }}</span></label
                  ><label v-if="chosen('images', row.id)" class="document-caption"
                    >{{ t('proto.documentCaption')
                    }}<input
                      v-model="state.active.value.images.find((ref) => ref.id === row.id)!.caption"
                      maxlength="500"
                      @input="state.changed.value = true"
                  /></label>
                </div>
              </fieldset>
              <fieldset :disabled="state.busy.value || state.loading.value">
                <legend>{{ t('proto.documentChecks') }}</legend>
                <p v-if="!state.checks.value?.total">{{ t('proto.documentNoSources') }}</p>
                <label v-for="row in state.checks.value?.data" :key="row.id" class="document-source"
                  ><input
                    type="checkbox"
                    :checked="chosen('checks', row.id)"
                    @change="toggle('checks', row, ($event.target as HTMLInputElement).checked)"
                  /><span
                    >{{ row.title
                    }}<small
                      >{{ t('proto.documentManual', { result: row.result.text }) }} ·
                      {{ row.viewportWidth }}×{{ row.viewportHeight }}</small
                    ></span
                  ></label
                ><a-pagination
                  v-if="(state.checks.value?.total || 0) > 20"
                  size="small"
                  :current="state.indexes.checks + 1"
                  :total="state.checks.value?.total"
                  :page-size="20"
                  :show-size-changer="false"
                  @change="pageChange('checks', $event)"
                />
              </fieldset>
              <details class="document-selected" :open="state.conflict.value">
                <summary>{{ t('proto.documentSourceList') }}</summary>
                <ul>
                  <li v-for="source in selectedSources" :key="`${source.kind}:${source.id}`">
                    <span>{{ label(source.id) }}</span
                    ><button
                      type="button"
                      :disabled="state.busy.value"
                      :aria-label="t('proto.documentRemoveSource', { name: label(source.id) })"
                      @click="toggle(source.kind, { id: source.id, configVersion: 0 }, false)"
                    >
                      ×
                    </button>
                  </li>
                </ul>
              </details>
            </template>
          </template>
          <template v-else-if="step === 1"
            ><div class="document-editor">
              <label for="document-title">{{ t('proto.documentTitle') }}</label
              ><input
                id="document-title"
                v-model="state.document.title"
                maxlength="120"
                :disabled="state.busy.value"
                @input="state.changed.value = true"
              /><label for="document-introduction">{{ t('proto.documentIntroduction') }}</label
              ><textarea
                id="document-introduction"
                v-model="state.document.introduction"
                rows="4"
                maxlength="4000"
                :disabled="state.busy.value"
                @input="state.changed.value = true"
              /><template v-if="state.active.value"
                ><label for="document-body">{{ activeName }} · {{ t('proto.documentBody') }}</label
                ><textarea
                  id="document-body"
                  v-model="state.active.value.body"
                  class="document-body"
                  maxlength="20000"
                  :disabled="state.busy.value"
                  @input="state.changed.value = true"
                />
              </template></div
          ></template>
          <article v-else class="document-reader">
            <h2 tabindex="-1" data-document-heading>{{ state.document.title }}</h2>
            <p v-if="state.document.introduction" class="document-text">
              {{ state.document.introduction }}
            </p>
            <section v-for="(page, index) in state.document.pages" :key="page.pageId">
              <h3>
                {{ index + 1 }}.
                {{ state.pages.value.find((item) => item.pageId === page.pageId)?.name }}
              </h3>
              <p class="document-text">{{ page.body }}</p>
              <figure v-for="image in page.images" :key="image.id">
                <img
                  v-if="state.imageUrls[image.id]"
                  :src="state.imageUrls[image.id]"
                  :alt="image.caption || label(image.id)"
                />
                <figcaption>{{ image.caption || label(image.id) }}</figcaption>
              </figure>
              <details>
                <summary>{{ t('proto.documentSourceList') }}</summary>
                <ul>
                  <li
                    v-for="(source, sourceIndex) in [
                      ...page.descriptions,
                      ...page.materials,
                      ...page.images,
                      ...page.checks,
                    ]"
                    :key="`${source.id}:${sourceIndex}`"
                  >
                    {{ label(source.id) }}
                  </li>
                </ul>
              </details>
            </section>
          </article>
        </main>
      </div>
      <footer v-if="state.available.value" class="document-footer">
        <span>{{ t('proto.documentSession') }}</span>
        <div>
          <a-button v-if="step > 0" :disabled="state.busy.value" @click="go(step - 1)">{{
            t('proto.documentBack')
          }}</a-button
          ><a-button
            v-if="step === 0 || state.needsAssembly.value || state.conflict.value"
            type="primary"
            :loading="state.busy.value"
            :disabled="!state.valid.value || state.loading.value"
            @click="assemble"
            >{{
              t(state.assembled.value ? 'proto.documentReassemble' : 'proto.documentAssemble')
            }}</a-button
          ><a-button v-else-if="step === 1" type="primary" @click="go(2)">{{
            t('proto.documentNext')
          }}</a-button
          ><template v-else
            ><a-button
              :disabled="
                state.busy.value ||
                state.needsAssembly.value ||
                !state.valid.value ||
                state.conflict.value
              "
              @click="state.exportDocument('markdown')"
              >{{ t('proto.documentMarkdown') }}</a-button
            ><a-button
              type="primary"
              :loading="state.busy.value"
              :disabled="state.needsAssembly.value || !state.valid.value || state.conflict.value"
              @click="state.exportDocument('html')"
              >{{ t('proto.documentHtml') }}</a-button
            ></template
          >
        </div>
      </footer>
      <ModalContextHolder />
    </section>
  </div>
</template>
<style scoped>
.delivery-document-overlay {
  position: fixed;
  inset: 0;
  z-index: 1001;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 45%);
}
.delivery-document {
  width: min(1320px, 100%);
  height: min(920px, 100%);
  display: flex;
  flex-direction: column;
  color: var(--color-text);
  background: var(--color-surface);
  border-radius: var(--radius);
  box-shadow: 0 16px 48px rgb(0 0 0 / 18%);
  overflow: hidden;
}
.document-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 28px 16px;
  border-bottom: 1px solid var(--color-border);
}
.document-header h1 {
  margin: 0 0 6px;
  font-size: 22px;
  line-height: 1.35;
}
.document-header p {
  margin: 0;
  color: var(--color-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.document-header > button {
  font-size: 24px;
  width: 44px;
  min-height: 44px;
}
.document-steps {
  display: flex;
  gap: 24px;
  padding: 0 28px;
  border-bottom: 1px solid var(--color-border);
}
.document-steps button {
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 14px 0;
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  display: flex;
  gap: 8px;
  cursor: pointer;
}
.document-steps button[aria-current] {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 600;
}
.document-steps button:disabled {
  cursor: default;
  opacity: 0.5;
}
.document-alert {
  margin: 12px 20px 0;
  flex-shrink: 0;
}
.document-layout {
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr);
  min-height: 0;
  flex: 1;
}
.document-pages {
  padding: 22px 18px;
  overflow: auto;
  border-right: 1px solid var(--color-border);
  background: var(--color-background);
}
.document-pages h2 {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  margin: 0 0 14px;
}
.document-pages h2 span {
  font-weight: 400;
  color: var(--color-muted);
}
.document-sequence,
.document-available-pages {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
}
.document-sequence li {
  margin: 0 0 6px;
  border: 1px solid transparent;
  border-radius: var(--radius);
}
.document-sequence li.selected {
  border-color: var(--color-primary);
  background: var(--color-surface);
}
.document-page-name {
  text-align: start;
  padding: 10px;
  width: 100%;
  overflow-wrap: anywhere;
}
.document-page-name,
.document-page-actions button {
  background: transparent;
  color: inherit;
  border: none;
  cursor: pointer;
  font: inherit;
}
.document-page-actions {
  display: flex;
  justify-content: flex-end;
}
.document-page-actions button {
  width: 36px;
  height: 32px;
}
.document-page-actions button:disabled {
  opacity: 0.35;
  cursor: default;
}
.document-pages > label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
}
.document-available-pages {
  margin-top: 12px;
}
.document-available-pages label,
.document-source {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.document-available-pages input,
.document-source input {
  flex-shrink: 0;
  margin-top: 4px;
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
}
.document-available-pages small,
.document-source small {
  display: block;
  color: var(--color-muted);
  font-size: 12px;
  margin-top: 4px;
  white-space: pre-wrap;
}
.document-main {
  overflow: auto;
  min-width: 0;
  padding: 26px 36px 36px;
  scroll-padding: 24px;
}
.document-main h2 {
  font-size: 22px;
  line-height: 1.4;
  margin: 0 0 22px;
  overflow-wrap: anywhere;
}
.document-main fieldset {
  min-width: 0;
  padding: 0 0 22px;
  margin: 0 0 24px;
  border: 0;
  border-bottom: 1px solid var(--color-border);
}
.document-main legend {
  font-weight: 600;
  font-size: 16px;
  margin: 0 0 8px;
}
.document-note {
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.6;
  margin: 0 0 8px;
}
.document-material {
  border-bottom: 1px solid var(--color-border);
}
.document-subchoice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 12px 26px;
}
.document-caption {
  display: grid;
  gap: 6px;
  margin: 0 0 14px 26px;
}
.document-editor {
  display: grid;
  gap: 10px;
  max-width: 880px;
  margin: auto;
}
.document-editor label {
  font-weight: 600;
  margin-top: 12px;
}
.document-editor input,
.document-editor textarea,
.document-pages > input,
.document-caption input {
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 10px 12px;
  width: 100%;
  min-width: 0;
  font: inherit;
}
.document-editor textarea {
  resize: vertical;
  line-height: 1.7;
}
.document-body {
  min-height: 360px;
}
.document-reader {
  max-width: 760px;
  margin: auto;
}
.document-reader h2 {
  font-size: 30px;
}
.document-reader > section {
  padding: 24px 0;
  border-top: 1px solid var(--color-border);
}
.document-reader h3 {
  font-size: 21px;
  margin: 0 0 18px;
}
.document-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
}
.document-reader figure {
  margin: 24px 0;
}
.document-reader img {
  max-width: 100%;
  height: auto;
}
.document-reader figcaption {
  color: var(--color-muted);
  line-height: 1.6;
}
.document-selected,
.document-reader details {
  color: var(--color-muted);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.document-selected li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.document-selected button {
  border: 0;
  background: transparent;
  color: inherit;
  min-width: 44px;
  min-height: 44px;
  cursor: pointer;
}
.document-footer {
  border-top: 1px solid var(--color-border);
  padding: 16px 28px;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  align-items: center;
}
.document-footer > span {
  color: var(--color-muted);
  font-size: 12px;
}
.document-footer > div {
  display: flex;
  gap: 10px;
}
.document-empty {
  padding: 60px 12px;
  text-align: center;
  color: var(--color-muted);
}
.delivery-document :is(button, input, textarea, summary):focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
@media (max-width: 700px) {
  .delivery-document-overlay {
    padding: 0;
  }
  .delivery-document {
    width: 100%;
    height: 100dvh;
    border-radius: 0;
  }
  .document-header {
    padding: 16px;
  }
  .document-header h1 {
    font-size: 20px;
  }
  .document-steps {
    padding: 0 16px;
    gap: 12px;
    justify-content: space-between;
  }
  .document-steps button {
    font-size: 13px;
    gap: 5px;
  }
  .document-layout {
    display: flex;
    flex-direction: column;
    overflow: auto;
  }
  .document-pages {
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
    overflow: visible;
    padding: 18px 16px;
    flex-shrink: 0;
  }
  .document-sequence {
    margin-bottom: 12px;
  }
  .document-sequence li {
    display: flex;
    align-items: center;
  }
  .document-page-actions button {
    width: 44px;
    height: 44px;
  }
  .document-main {
    overflow: visible;
    padding: 24px 16px;
    flex-shrink: 0;
  }
  .document-main h2 {
    font-size: 20px;
  }
  .document-reader h2 {
    font-size: 26px;
  }
  .document-footer {
    padding: 12px 16px max(12px, env(safe-area-inset-bottom));
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .document-footer > div {
    flex-wrap: wrap;
  }
  .document-footer :deep(button) {
    min-height: 44px;
    flex: 1;
    white-space: normal;
    height: auto;
  }
  .document-source,
  .document-available-pages label {
    min-height: 44px;
  }
  .document-body {
    min-height: 320px;
  }
}
</style>
