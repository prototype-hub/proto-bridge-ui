<script setup lang="ts">
defineOptions({ name: 'PrototypeLicenseView' })
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Alert as AAlert,
  Modal,
  Button as AButton,
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  Result as AResult,
  Skeleton as ASkeleton,
  Upload as AUpload,
} from 'ant-design-vue'
import { DownloadOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { download } from '@/shared/api/client'
import PageContainer from '@/shared/components/PageContainer.vue'
import { useLicense } from './hooks/useLicense'

const { t, locale } = useI18n()
const AInputTextArea = AInput.TextArea
const [modal, ModalContextHolder] = Modal.useModal()
const state = useLicense()
const {
  data,
  document,
  filename,
  loading,
  busy,
  denied,
  loadError,
  inputError,
  success,
  unknown,
  checked,
  canQuery,
  canImport,
} = state
const resultHeading = ref<HTMLElement>()
const field = ref<{ focus: () => void }>()
const locked = computed(() => busy.value || unknown.value)
const statusTitle = computed(() => t(`proto.licenseStatus_${data.value?.status || 'missing'}`))
const statusHint = computed(() => t(`proto.licenseHint_${data.value?.status || 'missing'}`))
const number = (value: number) => new Intl.NumberFormat(locale.value).format(value)
const limit = (value: number) => (value === -1 ? t('proto.licenseUnlimited') : number(value))
const date = (value: number) =>
  new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(value)
const claims = computed(() => data.value?.verifiedEntitlements)

async function submit() {
  const imported = await state.submit()
  await nextTick()
  if (imported || unknown.value || denied.value) resultHeading.value?.focus()
  else field.value?.focus()
}
async function checkResult() {
  await state.load()
  await nextTick()
  resultHeading.value?.focus()
}
function downloadRequest() {
  if (!data.value) return
  void download({
    blob: new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 1,
            installationId: data.value.installationId,
            algorithm: 'Ed25519',
            purpose: 'prototype-hub-license-request',
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    ),
    filename: 'prototype-hub-installation-request.json',
    contentType: 'application/json',
  })
}
function confirmLeave(): Promise<boolean> {
  if (busy.value) return Promise.resolve(false)
  if (!document.value && !unknown.value) return Promise.resolve(true)
  return new Promise((resolve) =>
    modal.confirm({
      title: t('proto.licenseLeaveTitle'),
      content: t(unknown.value ? 'proto.licenseLeaveUnknown' : 'proto.licenseLeaveHint'),
      okText: t('proto.licenseLeave'),
      cancelText: t('common.cancel'),
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    }),
  )
}
onBeforeRouteLeave(confirmLeave)
function unload(event: BeforeUnloadEvent) {
  if (document.value || unknown.value || busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', unload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', unload))
</script>

<template>
  <page-container class="license-page" :title="t('proto.licenseTitle')">
    <ModalContextHolder />
    <template #actions
      ><a-button :loading="loading" :disabled="busy || !canQuery || denied" @click="state.load"
        ><reload-outlined aria-hidden="true" />{{ t('common.refresh') }}</a-button
      ></template
    >
    <div
      v-if="!canQuery || denied"
      ref="resultHeading"
      tabindex="-1"
      role="alert"
      class="license-denied"
    >
      <a-result
        status="403"
        :title="t('proto.licenseNoAccess')"
        :sub-title="t('proto.licenseNoAccessHint')"
      />
    </div>
    <a-skeleton v-else-if="loading && !data" active :paragraph="{ rows: 8 }" :title="false" />
    <template v-else>
      <a-alert
        v-if="loadError"
        type="error"
        show-icon
        :message="t('proto.licenseLoadError')"
        :description="loadError"
        ><template #action
          ><a-button @click="state.load">{{ t('common.retry') }}</a-button></template
        ></a-alert
      >
      <template v-if="data">
        <section class="license-overview" aria-labelledby="license-status-title">
          <div class="license-status">
            <h2 id="license-status-title">{{ statusTitle }}</h2>
            <p>{{ statusHint }}</p>
          </div>
          <dl class="license-capacity">
            <div>
              <dt>{{ t('proto.licenseActualProjects') }}</dt>
              <dd>{{ limit(data.enforcedCapacity.projectLimit) }}</dd>
            </div>
            <div>
              <dt>{{ t('proto.licenseActualVersions') }}</dt>
              <dd>{{ limit(data.enforcedCapacity.versionLimit) }}</dd>
            </div>
          </dl>
          <p class="license-boundary">{{ t('proto.licenseEnforcementHint') }}</p>
        </section>

        <div
          v-if="success || unknown"
          ref="resultHeading"
          class="license-result"
          tabindex="-1"
          role="status"
          aria-live="polite"
        >
          <a-alert
            v-if="success"
            type="success"
            show-icon
            :message="t(`proto.${success}`)"
            :description="t('proto.licenseVerifiedOnly')"
          />
          <a-alert
            v-else
            type="warning"
            show-icon
            :message="t('proto.licenseUnknown')"
            :description="t(checked ? 'proto.licenseNotConfirmed' : 'proto.licenseUnknownHint')"
          >
            <template #action
              ><a-button :loading="loading" @click="checkResult">{{
                t('proto.licenseCheckResult')
              }}</a-button></template
            >
          </a-alert>
        </div>

        <div class="license-workspace">
          <section class="license-installation" aria-labelledby="license-installation-title">
            <h2 id="license-installation-title">{{ t('proto.licenseInstallation') }}</h2>
            <p class="license-secondary">{{ t('proto.licenseInstallationHint') }}</p>
            <dl class="license-identity">
              <div>
                <dt>{{ t('proto.licenseInstallationId') }}</dt>
                <dd translate="no">{{ data.installationId }}</dd>
              </div>
            </dl>
            <a-button @click="downloadRequest"
              ><download-outlined aria-hidden="true" />{{
                t('proto.licenseDownloadRequest')
              }}</a-button
            >
            <details class="license-help">
              <summary>{{ t('proto.licenseAbout') }}</summary>
              <p>
                {{
                  t('proto.licenseFreeHint', {
                    projects: number(data.freeEntitlements.maxProjects),
                    versions: number(data.freeEntitlements.baseVersionsPerProject),
                  })
                }}
              </p>
              <p>{{ t('proto.licenseOfflineHint') }}</p>
              <p>{{ t('proto.licenseRestoreHint') }}</p>
            </details>
          </section>

          <section class="license-import" aria-labelledby="license-import-title">
            <h2 id="license-import-title">{{ t('proto.licenseImportTitle') }}</h2>
            <p class="license-secondary">{{ t('proto.licenseImportHint') }}</p>
            <a-alert
              v-if="!data.trustConfigured"
              class="license-trust"
              type="info"
              show-icon
              :message="t('proto.licenseTrustMissing')"
              :description="t('proto.licenseTrustHint')"
            />
            <a-alert
              v-else-if="!canImport"
              type="info"
              show-icon
              :message="t('proto.licenseReadOnly')"
            />
            <a-form v-else :model="{ document }" layout="vertical" @finish="submit">
              <a-upload
                :show-upload-list="false"
                accept=".json,application/json"
                :disabled="locked"
                :before-upload="state.readFile"
                ><a-button :disabled="locked"
                  ><upload-outlined aria-hidden="true" />{{
                    t('proto.licenseSelectFile')
                  }}</a-button
                ></a-upload
              >
              <p v-if="filename" class="license-filename">
                {{ t('proto.licenseSelectedFile') }} <span>{{ filename }}</span>
              </p>
              <a-form-item
                :label="t('proto.licenseDocument')"
                html-for="license-document"
                name="document"
                :validate-status="inputError ? 'error' : undefined"
              >
                <template v-if="inputError" #help
                  ><span id="license-input-error">{{ inputError }}</span></template
                >
                <a-input-text-area
                  id="license-document"
                  ref="field"
                  :value="document"
                  :rows="6"
                  :disabled="locked"
                  :spellcheck="false"
                  autocomplete="off"
                  name="license-document"
                  :aria-invalid="!!inputError"
                  :aria-describedby="inputError ? 'license-input-error' : 'license-document-hint'"
                  @update:value="state.editDocument"
                />
              </a-form-item>
              <p id="license-document-hint" class="license-secondary license-field-hint">
                {{ t('proto.licenseFileHint') }}
              </p>
              <div class="license-import-actions">
                <a-button
                  type="primary"
                  html-type="submit"
                  :loading="busy"
                  :disabled="unknown && !checked"
                  >{{ t(unknown ? 'proto.licenseRetryImport' : 'proto.licenseSubmit') }}</a-button
                ><a-button :disabled="locked || !document" @click="state.clearInput">{{
                  t('proto.licenseClear')
                }}</a-button>
              </div>
            </a-form>
          </section>
        </div>

        <section
          v-if="data.acceptedCredential"
          class="license-record"
          aria-labelledby="license-record-title"
        >
          <h2 id="license-record-title">{{ t('proto.licenseAcceptedRecord') }}</h2>
          <dl class="license-record-summary">
            <div>
              <dt>{{ t('proto.licenseCredentialId') }}</dt>
              <dd>{{ data.acceptedCredential.licenseId }}</dd>
            </div>
            <div>
              <dt>{{ t('proto.licenseSequence') }}</dt>
              <dd>{{ number(data.acceptedCredential.sequence) }}</dd>
            </div>
            <div>
              <dt>{{ t('proto.licenseAcceptedAt') }}</dt>
              <dd>{{ date(data.acceptedCredential.acceptedAt) }}</dd>
            </div>
          </dl>
          <details class="license-help">
            <summary>{{ t('proto.licenseShowClaims') }}</summary>
            <p>{{ t('proto.licenseVerifiedOnly') }}</p>
            <dl class="license-claims">
              <div>
                <dt>{{ t('proto.licenseFingerprint') }}</dt>
                <dd translate="no">{{ data.acceptedCredential.fingerprint }}</dd>
              </div>
              <div>
                <dt>{{ t('proto.licenseKeyId') }}</dt>
                <dd>{{ data.acceptedCredential.keyId }}</dd>
              </div>
              <template v-if="claims"
                ><div>
                  <dt>{{ t('proto.licenseCustomer') }}</dt>
                  <dd>{{ claims.customer }}</dd>
                </div>
                <div>
                  <dt>{{ t('proto.licenseEdition') }}</dt>
                  <dd>{{ claims.edition }}</dd>
                </div>
                <div>
                  <dt>{{ t('proto.licenseClaimedProjects') }}</dt>
                  <dd>{{ number(claims.maxProjects) }}</dd>
                </div>
                <div>
                  <dt>{{ t('proto.licenseClaimedVersions') }}</dt>
                  <dd>{{ number(claims.baseVersionsPerProject) }}</dd>
                </div>
                <div>
                  <dt>{{ t('proto.licenseFeatures') }}</dt>
                  <dd>{{ claims.features.join(', ') || t('proto.licenseNone') }}</dd>
                </div>
                <div>
                  <dt>{{ t('proto.licenseIssuedAt') }}</dt>
                  <dd>{{ date(claims.issuedAt) }}</dd>
                </div>
                <div>
                  <dt>{{ t('proto.licenseNotBefore') }}</dt>
                  <dd>{{ date(claims.notBefore) }}</dd>
                </div>
                <div v-if="claims.trialEndsAt != null">
                  <dt>{{ t('proto.licenseTrialEndsAt') }}</dt>
                  <dd>{{ date(claims.trialEndsAt) }}</dd>
                </div>
                <div v-if="claims.maintenanceUntil != null">
                  <dt>{{ t('proto.licenseMaintenanceUntil') }}</dt>
                  <dd>{{ date(claims.maintenanceUntil) }}</dd>
                </div>
                <div v-for="grant in claims.projectVersionGrants" :key="grant.projectId">
                  <dt>{{ t('proto.licenseProjectGrant', { project: grant.projectId }) }}</dt>
                  <dd>
                    {{ t('proto.licenseGrantBlocks', { count: number(grant.extraVersionBlocks) }) }}
                  </dd>
                </div></template
              >
            </dl>
          </details>
        </section>
      </template>
    </template>
  </page-container>
</template>

<style scoped>
.license-page {
  max-width: 1440px;
  margin-inline: auto;
}
.license-page h2 {
  margin: 0 0 var(--space-3);
  font-size: calc(var(--text-body) * 1.15);
  line-height: 1.5;
  text-wrap: balance;
}
.license-page p {
  line-height: 1.65;
}
.license-overview,
.license-installation,
.license-import,
.license-record {
  background: var(--color-surface);
  border-radius: var(--radius);
  padding: var(--space-6);
  min-width: 0;
}
.license-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-4) var(--space-6);
  margin-bottom: var(--space-4);
}
.license-status p {
  margin: 0;
  max-width: 70ch;
  color: var(--color-muted);
}
.license-capacity {
  display: flex;
  gap: var(--space-6);
  margin: 0;
  align-items: center;
}
.license-page dt {
  color: var(--color-muted);
  overflow-wrap: anywhere;
}
.license-page dd {
  margin: var(--space-2) 0 0;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.license-capacity dd {
  font-size: var(--text-title);
  font-weight: 600;
}
.license-boundary {
  grid-column: 1 / -1;
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-4);
  margin: 0;
  color: var(--color-muted);
}
.license-workspace {
  display: grid;
  grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1.2fr);
  gap: var(--space-4);
  align-items: start;
}
.license-secondary {
  color: var(--color-muted);
}
.license-identity {
  margin: var(--space-6) 0;
}
.license-help {
  margin-top: var(--space-6);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-4);
}
.license-help summary {
  cursor: pointer;
  color: var(--color-primary);
  padding: var(--space-2) 0;
}
.license-help p {
  max-width: 70ch;
}
.license-trust {
  margin-top: var(--space-6);
}
.license-import .ant-form {
  margin-top: var(--space-6);
}
.license-import .ant-form-item {
  margin: var(--space-4) 0 0;
}
.license-filename {
  overflow-wrap: anywhere;
  color: var(--color-muted);
  margin: var(--space-3) 0 0;
}
.license-field-hint {
  margin: var(--space-2) 0 var(--space-4);
}
.license-import-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.license-result {
  margin-bottom: var(--space-4);
  scroll-margin-block: var(--space-6);
}
.license-record {
  margin-top: var(--space-4);
}
.license-record-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
  margin: var(--space-4) 0 0;
}
.license-claims {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4) var(--space-6);
}
@media (max-width: 900px) {
  .license-workspace {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 600px) {
  .license-result :deep(.ant-alert) {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    row-gap: var(--space-3);
  }
  .license-result :deep(.ant-alert-action) {
    grid-column: 2;
    margin-inline-start: 0;
  }
  .license-overview {
    grid-template-columns: 1fr;
  }
  .license-capacity {
    justify-content: space-between;
    gap: var(--space-4);
  }
  .license-overview,
  .license-installation,
  .license-import,
  .license-record {
    padding: var(--space-4);
  }
  .license-record-summary,
  .license-claims {
    grid-template-columns: 1fr;
  }
  .license-import-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
  .license-import-actions .ant-btn {
    min-height: 44px;
  }
  .license-page :deep(.pro-page-header) {
    padding-inline: var(--space-4);
  }
}
</style>
