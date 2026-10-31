<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Drawer as ADrawer,
  Button as AButton,
  Alert as AAlert,
  Tag as ATag,
  Textarea as ATextarea,
  Pagination as APagination,
  Radio as ARadio,
  Checkbox as ACheckbox,
} from 'ant-design-vue'
import { ArrowLeftOutlined } from '@ant-design/icons-vue'
import LoadState from '@/shared/components/LoadState.vue'
import type { ReviewAssociationsController } from '../hooks/useReviewAssociations'
import type { ReviewAssociation } from '../types'
const props = defineProps<{
  open: boolean
  state: ReviewAssociationsController
  projectName: string
  versionName: string
}>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const state = props.state
const heading = ref<HTMLElement>(),
  result = ref<HTMLElement>()
const historyItem = ref<ReviewAssociation>()
const blocked = computed(() => state.busy.value || state.unknown.value)
const ready = computed(
  () =>
    state.editable.value &&
    !!state.context.value &&
    state.confirmed.value &&
    (state.mode.value === 'create'
      ? state.context.value.eligible &&
        !state.context.value.activeAssociation &&
        state.selected.value?.enabled === true &&
        !!state.evidence.value.trim() &&
        state.evidence.value.trim().length <= 1000
      : !!state.context.value.activeAssociation &&
        !!state.reason.value.trim() &&
        state.reason.value.trim().length <= 1000),
)

function status(value: ReviewAssociation['status']) {
  return t(`proto.associationStatus_${value}`)
}
function unavailable(reason: string | null) {
  return t(
    `proto.associationReason_${['SHARE_UNAVAILABLE', 'SHARE_CHANGED', 'TARGET_UNAVAILABLE', 'TARGET_CHANGED', 'REVISION_UNAVAILABLE'].includes(reason || '') ? reason : 'UNAVAILABLE'}`,
  )
}
function back() {
  if (blocked.value) return
  if (historyItem.value) historyItem.value = undefined
  else if (state.mode.value !== 'overview') state.cancel()
  else emit('close')
}
async function focusHeading() {
  await nextTick()
  heading.value?.focus()
}
watch(
  () => [state.unknown.value, state.notice.value, state.error.value],
  async () => {
    if (!props.open || state.busy.value) return
    await nextTick()
    if (state.unknown.value || state.notice.value) result.value?.focus()
    else if (state.error.value) heading.value?.focus()
  },
)
watch(
  () => [props.open, state.mode.value, historyItem.value?.id],
  () => {
    if (props.open) void focusHeading()
    else historyItem.value = undefined
  },
)
</script>
<template>
  <a-drawer
    :open="open"
    :title="t('proto.associationTitle')"
    width="min(860px, 100vw)"
    root-class-name="review-associations-drawer"
    :closable="false"
    :mask-closable="!blocked"
    :keyboard="!blocked"
    @close="back"
    @after-open-change="(visible: boolean) => visible && focusHeading()"
  >
    <div
      class="association-workspace"
      role="dialog"
      aria-modal="true"
      :aria-label="t('proto.associationTitle')"
    >
      <header class="association-header">
        <a-button :disabled="blocked" @click="back"
          ><template #icon><arrow-left-outlined aria-hidden="true" /></template
          >{{
            t(
              state.mode.value === 'overview' && !historyItem
                ? 'proto.associationBackThread'
                : 'common.back',
            )
          }}</a-button
        >
        <h2 ref="heading" tabindex="-1">
          {{
            t(
              historyItem
                ? 'proto.associationHistoryDetail'
                : state.mode.value === 'create'
                  ? 'proto.associationCreate'
                  : state.mode.value === 'revoke'
                    ? 'proto.associationRevoke'
                    : 'proto.associationTitle',
            )
          }}
        </h2>
        <p class="association-subtitle">{{ t('proto.associationSubtitle') }}</p>
      </header>
      <div
        v-if="state.unknown.value || state.notice.value"
        ref="result"
        tabindex="-1"
        class="association-result"
        role="region"
        :aria-label="t('proto.associationSubmissionResult')"
      >
        <a-alert
          v-if="state.unknown.value"
          type="warning"
          show-icon
          :message="t('proto.associationUnknown')"
        >
          <template #action
            ><a-button :loading="state.busy.value" @click="state.retry">{{
              t('proto.associationRetryExact')
            }}</a-button></template
          >
        </a-alert>
        <a-alert
          v-else
          :type="state.notice.value === t('proto.associationConflict') ? 'warning' : 'info'"
          show-icon
          :message="state.notice.value"
        />
      </div>
      <load-state :loading="state.loading.value" :error="state.error.value" @retry="state.load()">
        <template v-if="state.context.value">
          <section class="association-scope" :aria-label="t('proto.associationScope')">
            <dl>
              <div>
                <dt>{{ t('proto.associationProjectVersion') }}</dt>
                <dd>{{ projectName }} <span aria-hidden="true"> / </span>{{ versionName }}</dd>
              </div>
              <div>
                <dt>{{ t('proto.associationRevision') }}</dt>
                <dd>{{ state.context.value.revisionId }}</dd>
              </div>
              <div>
                <dt>{{ t('proto.associationOriginalShare') }}</dt>
                <dd>
                  <a-tag :color="state.context.value.eligible ? 'success' : 'warning'">{{
                    t(
                      state.context.value.eligible
                        ? 'proto.associationShareAvailable'
                        : 'proto.associationShareUnavailable',
                    )
                  }}</a-tag
                  ><span class="association-id">{{ state.context.value.shareId }}</span>
                </dd>
              </div>
              <div>
                <dt>{{ t('proto.associationSource') }}</dt>
                <dd>
                  <strong>{{ state.context.value.sourceThread.authorName }}</strong
                  ><span v-if="state.context.value.sourceThread.authorCompany">
                    · {{ state.context.value.sourceThread.authorCompany }}</span
                  ><a-tag>{{ t('proto.reviewUnverified') }}</a-tag>
                </dd>
              </div>
            </dl>
          </section>
          <a-alert
            v-if="!state.context.value.eligible"
            type="warning"
            show-icon
            :message="unavailable(state.context.value.unavailableReason)"
            :description="t('proto.associationUnavailableHelp')"
          />
          <template v-if="historyItem">
            <section class="association-section">
              <div class="association-section-title">
                <h3>
                  {{
                    historyItem.targetGuest?.displayName || t('proto.associationTargetUnavailable')
                  }}
                </h3>
                <a-tag>{{ status(historyItem.status) }}</a-tag>
              </div>
              <p>{{ historyItem.targetGuest?.maskedEmail }}</p>
              <dl class="association-audit">
                <div>
                  <dt>{{ t('proto.associationEvidence') }}</dt>
                  <dd>{{ historyItem.evidenceReference }}</dd>
                </div>
                <div>
                  <dt>{{ t('proto.associationGrantedBy') }}</dt>
                  <dd>
                    {{ historyItem.createdByName }} ·
                    {{ new Date(historyItem.createdAt).toLocaleString() }}
                  </dd>
                </div>
                <template v-if="historyItem.revokedAt"
                  ><div>
                    <dt>{{ t('proto.associationRevokeReason') }}</dt>
                    <dd>{{ historyItem.revokeReason }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('proto.associationRevokedBy') }}</dt>
                    <dd>
                      {{ historyItem.revokedByName }} ·
                      {{ new Date(historyItem.revokedAt).toLocaleString() }}
                    </dd>
                  </div></template
                >
              </dl>
            </section>
          </template>
          <template v-else-if="state.mode.value === 'overview'">
            <section class="association-section">
              <div class="association-section-title">
                <h3>{{ t('proto.associationCurrent') }}</h3>
                <a-tag v-if="state.context.value.activeAssociation">{{
                  status(state.context.value.activeAssociation.status)
                }}</a-tag>
              </div>
              <template v-if="state.context.value.activeAssociation">
                <p class="association-target-name">
                  {{
                    state.context.value.activeAssociation.targetGuest?.displayName ||
                    t('proto.associationTargetUnavailable')
                  }}
                </p>
                <p class="association-muted">
                  {{ state.context.value.activeAssociation.targetGuest?.maskedEmail
                  }}<span v-if="state.context.value.activeAssociation.targetGuest?.company">
                    · {{ state.context.value.activeAssociation.targetGuest.company }}</span
                  >
                </p>
                <a-alert
                  v-if="state.context.value.activeAssociation.status === 'invalidated'"
                  type="warning"
                  show-icon
                  :message="unavailable(state.context.value.activeAssociation.invalidReason)"
                  :description="t('proto.associationMustRevoke')"
                />
                <dl class="association-audit">
                  <div>
                    <dt>{{ t('proto.associationEvidence') }}</dt>
                    <dd>{{ state.context.value.activeAssociation.evidenceReference }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('proto.associationGrantedBy') }}</dt>
                    <dd>
                      {{ state.context.value.activeAssociation.createdByName }} ·
                      {{
                        new Date(state.context.value.activeAssociation.createdAt).toLocaleString()
                      }}
                    </dd>
                  </div>
                </dl>
                <a-button
                  v-if="state.editable.value"
                  danger
                  :disabled="blocked || state.loading.value"
                  @click="state.edit('revoke')"
                  >{{ t('proto.associationRevoke') }}</a-button
                >
              </template>
              <template v-else
                ><p class="association-empty">{{ t('proto.associationEmpty') }}</p>
                <a-button
                  v-if="state.editable.value"
                  type="primary"
                  :disabled="!state.context.value.eligible || blocked"
                  @click="state.edit('create')"
                  >{{ t('proto.associationCreate') }}</a-button
                ></template
              >
            </section>
            <section class="association-section">
              <div class="association-section-title">
                <h3>{{ t('proto.associationHistory') }}</h3>
                <a-button :disabled="blocked" @click="state.load()">{{
                  t('common.refresh')
                }}</a-button>
              </div>
              <p v-if="!state.history.value.length" class="association-muted">
                {{ t('proto.associationHistoryEmpty') }}
              </p>
              <ul v-else class="association-history">
                <li v-for="item in state.history.value" :key="item.id">
                  <a-button type="link" @click="historyItem = item">{{
                    item.targetGuest?.displayName || t('proto.associationTargetUnavailable')
                  }}</a-button
                  ><a-tag>{{ status(item.status) }}</a-tag
                  ><time :datetime="new Date(item.createdAt).toISOString()">{{
                    new Date(item.createdAt).toLocaleString()
                  }}</time>
                </li>
              </ul>
              <a-pagination
                v-if="state.historyTotal.value > 20 || state.historyPage.value"
                class="association-pagination"
                simple
                :current="state.historyPage.value + 1"
                :page-size="20"
                :total="state.historyTotal.value"
                :show-size-changer="false"
                :disabled="blocked"
                @change="(page: number) => state.load(page - 1)"
              />
            </section>
          </template>
          <form v-else class="association-form" @submit.prevent="state.save">
            <section v-if="state.mode.value === 'create'" class="association-section">
              <div class="association-section-title">
                <h3>{{ t('proto.associationChooseTarget') }}</h3>
                <a-button
                  :disabled="blocked || state.searching.value"
                  @click="state.targets(state.candidatePage.value)"
                  >{{ t('common.refresh') }}</a-button
                >
              </div>
              <p class="association-muted">{{ t('proto.associationTargetHelp') }}</p>
              <load-state
                :loading="state.searching.value"
                :error="state.candidateError.value"
                @retry="state.targets(state.candidatePage.value)"
              >
                <p v-if="!state.candidates.value.length">{{ t('proto.associationNoTargets') }}</p>
                <div
                  v-else
                  role="radiogroup"
                  :aria-label="t('proto.associationChooseTarget')"
                  class="association-candidates"
                >
                  <div
                    v-for="guest in state.candidates.value"
                    :key="guest.id"
                    class="association-candidate"
                    :class="{
                      'association-candidate-selected': state.selected.value?.id === guest.id,
                    }"
                  >
                    <a-radio
                      :checked="state.selected.value?.id === guest.id"
                      :disabled="!guest.enabled || blocked"
                      :value="guest.id"
                      name="association-target"
                      @change="state.select(guest)"
                      ><strong>{{ guest.displayName }}</strong
                      ><span class="association-candidate-meta"
                        >{{ guest.maskedEmail
                        }}<span v-if="guest.company"> · {{ guest.company }}</span></span
                      ></a-radio
                    ><a-tag v-if="!guest.enabled">{{ t('proto.associationTargetDisabled') }}</a-tag>
                  </div>
                </div>
              </load-state>
              <a-pagination
                v-if="state.candidateTotal.value > 20 || state.candidatePage.value"
                class="association-pagination"
                simple
                :current="state.candidatePage.value + 1"
                :page-size="20"
                :total="state.candidateTotal.value"
                :show-size-changer="false"
                :disabled="blocked || state.searching.value"
                @change="(page: number) => state.targets(page - 1)"
              />
              <p v-if="state.selected.value" class="association-selection" role="status">
                {{ t('proto.associationSelected') }}
                <strong>{{ state.selected.value.displayName }}</strong> ·
                {{ state.selected.value.maskedEmail }}
              </p>
              <label for="association-evidence" class="association-field-label">{{
                t('proto.associationEvidence')
              }}</label>
              <p id="association-evidence-help" class="association-muted">
                {{ t('proto.associationEvidenceHelp') }}
              </p>
              <a-textarea
                id="association-evidence"
                v-model:value="state.evidence.value"
                :disabled="blocked"
                :maxlength="1000"
                :rows="3"
                required
                aria-describedby="association-evidence-help"
              />
            </section>
            <section v-else class="association-section">
              <h3>{{ t('proto.associationRevokeConfirm') }}</h3>
              <p>
                {{
                  t('proto.associationRevokeImpact', {
                    source: state.context.value.sourceThread.authorName,
                    target:
                      state.context.value.activeAssociation?.targetGuest?.displayName ||
                      t('proto.associationTargetUnavailable'),
                  })
                }}
              </p>
              <label for="association-reason" class="association-field-label">{{
                t('proto.associationRevokeReason')
              }}</label>
              <a-textarea
                id="association-reason"
                v-model:value="state.reason.value"
                :disabled="blocked"
                :maxlength="1000"
                :rows="3"
                required
              />
            </section>
            <section class="association-confirmation">
              <h3>{{ t('proto.associationImpact') }}</h3>
              <p>
                {{
                  t(
                    state.mode.value === 'create'
                      ? 'proto.associationGrantImpact'
                      : 'proto.associationRevokeScope',
                  )
                }}
              </p>
              <p v-if="state.mode.value === 'create'" class="association-muted">
                {{ t('proto.associationIdentityBoundary') }}
              </p>
              <a-checkbox v-model:checked="state.confirmed.value" :disabled="blocked">{{
                t('proto.associationConfirmed')
              }}</a-checkbox>
            </section>
            <div class="association-form-actions">
              <a-button :disabled="blocked" @click="state.cancel">{{ t('common.cancel') }}</a-button
              ><a-button
                type="primary"
                :danger="state.mode.value === 'revoke'"
                html-type="submit"
                :loading="state.busy.value"
                :disabled="!ready || blocked"
                >{{
                  t(
                    state.mode.value === 'create'
                      ? 'proto.associationCreate'
                      : 'proto.associationRevoke',
                  )
                }}</a-button
              >
            </div>
          </form>
          <details class="association-help">
            <summary>{{ t('proto.associationRules') }}</summary>
            <p>{{ t('proto.associationIdentityBoundary') }}</p>
            <p>{{ t('proto.associationScopeRules') }}</p>
          </details>
        </template>
      </load-state>
    </div>
  </a-drawer>
</template>
<style scoped>
.association-workspace {
  display: grid;
  gap: var(--space-6);
  color: var(--color-text);
  overflow-wrap: anywhere;
}
.association-result:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 4px;
}
.association-header {
  display: grid;
  gap: var(--space-3);
}
.association-header > .ant-btn {
  justify-self: start;
}
h2,
h3,
p,
dl,
dd {
  margin: 0;
}
h2 {
  font-size: 1.5rem;
  line-height: 1.4;
}
h3 {
  font-size: 1rem;
  font-weight: 600;
}
h2:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 4px;
}
.association-subtitle,
.association-muted,
dt,
time {
  color: var(--color-muted);
  font-size: var(--text-small);
  line-height: 1.6;
}
.association-scope {
  padding: var(--space-4);
  background: var(--color-background);
  border-radius: var(--radius);
}
dl {
  display: grid;
  gap: var(--space-3);
}
dl > div {
  display: grid;
  grid-template-columns: 8rem minmax(0, 1fr);
  gap: var(--space-3);
}
dd {
  min-width: 0;
  white-space: pre-wrap;
  line-height: 1.6;
}
dd :deep(.ant-tag) {
  margin-inline: var(--space-2);
  white-space: normal;
}
.association-id {
  font-size: var(--text-small);
}
.association-section {
  display: grid;
  gap: var(--space-4);
  padding-block: var(--space-6);
  border-bottom: 1px solid var(--color-border);
}
.association-section > .ant-btn {
  justify-self: start;
}
.association-section-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.association-section-title > h3 {
  flex: 1;
}
.association-target-name {
  font-size: 1.125rem;
  font-weight: 600;
}
.association-empty {
  max-width: 65ch;
  line-height: 1.7;
}
.association-audit {
  font-size: var(--text-small);
}
.association-history {
  list-style: none;
  padding: 0;
  margin: 0;
}
.association-history li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding-block: var(--space-2);
}
.association-history .ant-btn {
  padding-inline: 0;
  height: auto;
  white-space: normal;
  text-align: start;
}
.association-history time {
  margin-inline-start: auto;
  font-variant-numeric: tabular-nums;
}
.association-pagination {
  display: flex;
  justify-content: flex-end;
}
.association-candidates {
  display: grid;
  border-top: 1px solid var(--color-border);
}
.association-candidate {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}
.association-candidate-selected {
  background: var(--color-background);
}
.association-candidate :deep(.ant-radio-wrapper) {
  flex: 1;
  min-width: 0;
  align-items: flex-start;
}
.association-candidate-meta {
  display: block;
  color: var(--color-muted);
  font-size: var(--text-small);
  margin-top: var(--space-1);
}
.association-field-label {
  font-weight: 600;
}
.association-selection {
  padding: var(--space-3);
  background: var(--color-background);
  border-radius: var(--radius);
  font-size: var(--text-small);
}
.association-confirmation {
  display: grid;
  gap: var(--space-3);
  padding-block: var(--space-6);
  line-height: 1.7;
}
.association-form-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding-block: var(--space-3);
}
.association-help {
  margin-top: var(--space-6);
  color: var(--color-muted);
  font-size: var(--text-small);
  line-height: 1.7;
}
.association-help summary {
  cursor: pointer;
  color: var(--color-text);
}
.association-help p {
  margin-top: var(--space-3);
}
textarea {
  caret-color: var(--color-primary);
}
@media (width <= 640px) {
  .association-result :deep(.ant-alert) {
    flex-wrap: wrap;
    row-gap: var(--space-3);
  }
  .association-result :deep(.ant-alert-action) {
    flex-basis: 100%;
    margin-inline-start: 24px;
  }

  dl > div {
    grid-template-columns: 1fr;
    gap: var(--space-1);
  }
  h2 {
    font-size: 1.25rem;
  }
  .association-history time {
    flex-basis: 100%;
    margin: 0;
  }
  .association-form-actions > .ant-btn {
    flex: 1;
    height: auto;
    min-height: 36px;
    white-space: normal;
  }
}
</style>
