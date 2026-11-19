<script setup lang="ts">
import {
  computed,
  toRef,
  shallowRef,
  ref,
  watch,
  nextTick,
  onScopeDispose,
  defineAsyncComponent,
  type PropType,
} from 'vue'
import {
  Modal as AModal,
  Textarea as ATextarea,
  InputPassword as AInputPassword,
  DatePicker as ADatePicker,
  Form as AForm,
  FormItem as AFormItem,
  Alert as AAlert,
  Button as AButton,
  Tag as ATag,
  RadioGroup as ARadioGroup,
  RadioButton as ARadioButton,
  Dropdown as ADropdown,
  Menu as AMenu,
  MenuItem as AMenuItem,
  Empty as AEmpty,
} from 'ant-design-vue'
import { DownOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { useShares } from '@/modules/protohub-manager-ui/views/project/hooks/useShares'
import type { Project, Share, Version } from '@/modules/protohub-manager-ui/types'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import PermissionButton from '@/shared/components/PermissionButton.vue'
import LoadState from '@/shared/components/LoadState.vue'
import TextEllipsis from '@/shared/components/TextEllipsis.vue'
import ShareCopyDialog from './ShareCopyDialog.vue'
import { usePermissions } from '@/shared/auth/provider'
import { projectAllows } from '@/modules/protohub-manager-ui/utils/project-access'
const ShareEditDialog = defineAsyncComponent(() => import('./ShareEditDialog.vue'))
const ReviewPolicyDialog = defineAsyncComponent(() => import('./ReviewPolicyDialog.vue'))
const ReviewInvitationsDialog = defineAsyncComponent(() => import('./ReviewInvitationsDialog.vue'))
const reviewTarget = shallowRef<Share>()
const invitationTarget = shallowRef<Share>()
const props = defineProps({
  version: { type: Object as PropType<Version>, default: undefined },
  project: { type: Object as PropType<Project>, default: undefined },
})
const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
const permissions = usePermissions()
const createOpen = ref(false)
const createForm = ref<HTMLElement>()
const createdResult = ref<HTMLElement>()
const shareList = ref<HTMLElement>()
const moreTarget = ref<string>()
const savedDraft = ref('')
let confirmation: ReturnType<typeof AModal.confirm> | undefined
const validityColors = {
  permanent: 'success',
  temporary: 'warning',
  expired: 'default',
  disabled: 'default',
  revoked: 'error',
} as const
const {
  task,
  resource,
  refresh,
  createdShare,
  creationUnknown,
  revisionMode,
  editTarget,
  editConflict,
  reloadEdit,
  edit,
  closeEdit,
  update,
  setEnabled,
  revoke,
  rotate,
  description,
  password,
  expires,
  create,
  remove,
  url,
  copy,
  validity,
  shareCopy,
} = useShares(toRef(props, 'version'), toRef(props, 'project'))
const draft = computed(() =>
  JSON.stringify([description.value, password.value, expires.value?.valueOf(), revisionMode.value]),
)
const date = (value: number) =>
  new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
const shareName = (share: Share) => share.description || t('proto.shareUntitled')
const menuContainer = (trigger: HTMLElement) =>
  trigger.closest<HTMLElement>('.ant-modal-content') || trigger
const canCreate = computed(
  () =>
    !props.version?.migrationRequired &&
    projectAllows(props.project, 'manageShares') &&
    permissions.can(p.share.save),
)
watch(
  () => [
    props.version?.id,
    props.project?.id,
    props.project?.capabilities?.manageShares,
    permissions.can(p.share.save),
  ],
  () => {
    reviewTarget.value = undefined
    invitationTarget.value = undefined
    createOpen.value = false
    moreTarget.value = undefined
    savedDraft.value = draft.value
    confirmation?.destroy()
    confirmation = undefined
  },
  { immediate: true },
)
watch(resource.data, (rows) => {
  if (invitationTarget.value)
    invitationTarget.value = rows.find((row) => row.id === invitationTarget.value?.id)
})
watch(createdShare, async (share) => {
  if (!share) return
  createOpen.value = false
  savedDraft.value = draft.value
  await nextTick()
  createdResult.value?.querySelector('button')?.focus()
})
onScopeDispose(() => confirmation?.destroy())
async function toggleCreate() {
  createOpen.value = !createOpen.value
  if (createOpen.value) {
    await nextTick()
    createForm.value?.querySelector('textarea')?.focus()
  }
}
function openMore(id: string, open: boolean) {
  moreTarget.value = open ? id : undefined
}
async function focusMoreMenu(id: string) {
  await nextTick()
  if (moreTarget.value !== id) return
  const menu = document.getElementById(`share-menu-${id}`)
  if (!menu?.contains(document.activeElement))
    menu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
}
function escapeMore(id: string, event: KeyboardEvent) {
  if (moreTarget.value !== id) return
  event.stopPropagation()
  event.preventDefault()
  void closeMore(id)
}
function navigateMore(id: string, event: KeyboardEvent) {
  const menu = document.getElementById(`share-menu-${id}`)
  if (moreTarget.value !== id || !(event.target instanceof Node) || !menu?.contains(event.target))
    return
  if (event.key === 'Tab') {
    moreTarget.value = undefined
    focusMoreTrigger(id)
    event.stopPropagation()
    return
  }
  if (event.key === 'Escape') {
    event.stopPropagation()
    event.preventDefault()
    void closeMore(id)
    return
  }
  const items = Array.from(
    menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'),
  ).filter((item) => item.getClientRects().length && getComputedStyle(item).visibility !== 'hidden')
  const current = items.indexOf(document.activeElement as HTMLElement)
  if (event.key === ' ' && current >= 0) {
    event.preventDefault()
    event.stopPropagation()
    items[current]?.click()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !items.length) return
  event.preventDefault()
  event.stopPropagation()
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : current < 0
          ? event.key === 'ArrowDown'
            ? 0
            : items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
  items[index]?.focus()
}
async function closeMore(id: string) {
  moreTarget.value = undefined
  await nextTick()
  focusMoreTrigger(id)
}
function focusMoreTrigger(id: string) {
  const row = Array.from(
    shareList.value?.querySelectorAll<HTMLElement>('[data-share-id]') || [],
  ).find((element) => element.dataset.shareId === id)
  row?.querySelector<HTMLButtonElement>('.share-more-trigger')?.focus()
}
function close() {
  if (task.busy.value) return
  if (draft.value === savedDraft.value && !creationUnknown.value) {
    emit('close')
    return
  }
  confirmation = AModal.confirm({
    title: t('proto.shareDiscardTitle'),
    content: t(creationUnknown.value ? 'proto.shareUnknownCloseHint' : 'proto.shareDiscardHint'),
    okText: t('proto.shareDiscard'),
    cancelText: t('proto.shareKeepEditing'),
    onOk: () => emit('close'),
  })
}
function reviewSaved() {
  reviewTarget.value = undefined
  void refresh()
}
// Keyboard submission follows the same permission and unknown-result boundary as the button.
const submitCreate = () => {
  if (canCreate.value && !creationUnknown.value) void create()
}
type LifecycleAction = 'enabled' | 'rotate' | 'revoke' | 'delete'
function confirmAction(share: Share, action: LifecycleAction) {
  if (task.busy.value) return
  const versionId = props.version?.id
  const permission = action === 'delete' ? p.share.delete : p.share.save
  if (!permissions.can(permission)) return
  const label =
    action === 'enabled'
      ? share.enabled
        ? 'proto.pauseShare'
        : 'proto.resumeShare'
      : action === 'rotate'
        ? 'proto.rotateShare'
        : action === 'revoke'
          ? 'proto.revokeShare'
          : 'common.delete'
  const consequence =
    action === 'enabled'
      ? share.enabled
        ? 'proto.pauseShareConfirm'
        : 'proto.resumeShareConfirm'
      : action === 'rotate'
        ? 'proto.rotateShareConfirm'
        : action === 'revoke'
          ? 'proto.revokeShareConfirm'
          : 'proto.deleteShareConfirm'
  confirmation = AModal.confirm({
    title: t('proto.shareActionTarget', { action: t(label), name: shareName(share) }),
    content: t(consequence),
    okText: t(label),
    cancelText: t('common.cancel'),
    okButtonProps: {
      danger: action === 'delete' || action === 'revoke',
      ...{ 'aria-label': t(label) },
    },
    cancelButtonProps: { type: 'default', ...{ 'aria-label': t('common.cancel') } },
    wrapClassName: 'share-action-confirmation',
    afterClose: () => void closeMore(share.id),
    // A confirmation cannot execute after its project/version or effective permission changed.
    onOk: async () => {
      if (
        props.version?.id !== versionId ||
        !projectAllows(props.project, 'manageShares') ||
        !permissions.can(permission)
      )
        return
      if (action === 'enabled') await setEnabled(share)
      else if (action === 'rotate') await rotate(share)
      else if (action === 'revoke') await revoke(share)
      else await remove(share.id)
    },
  })
}
</script>
<template>
  <a-modal
    :destroy-on-close="true"
    :open="!!version && projectAllows(project, 'manageShares')"
    :title="t('proto.share')"
    :footer="null"
    :width="1040"
    :mask-closable="false"
    :closable="!task.busy.value"
    :keyboard="!task.busy.value"
    wrap-class-name="share-management-modal"
    @cancel="close"
  >
    <div class="share-context">
      <strong>{{ project?.name }}</strong>
      <span>{{ version?.versionName }}</span>
    </div>
    <a-alert
      v-if="version?.migrationRequired"
      type="warning"
      show-icon
      :message="t('proto.revisionMigrationRequired')"
    />
    <div class="share-toolbar">
      <h2>{{ t('proto.shareListTitle', { count: resource.data.value.length }) }}</h2>
      <div class="share-toolbar-actions">
        <a-button :loading="resource.loading.value" :disabled="task.busy.value" @click="refresh">
          <template #icon><reload-outlined aria-hidden="true" /></template>
          {{ t('common.refresh') }}
        </a-button>
        <permission-button
          :permission="p.share.save"
          :type="createOpen ? 'default' : 'primary'"
          :disabled="!canCreate || task.busy.value"
          :aria-expanded="createOpen"
          aria-controls="share-create-region"
          @click="toggleCreate"
        >
          <template #icon><plus-outlined v-if="!createOpen" aria-hidden="true" /></template>
          {{ t(createOpen ? 'proto.shareCollapseCreate' : 'proto.createShare') }}
        </permission-button>
      </div>
    </div>
    <section
      v-show="createOpen"
      id="share-create-region"
      ref="createForm"
      class="share-create-region"
      :aria-label="t('proto.createShare')"
    >
      <a-form
        name="share-create"
        class="share-create"
        :model="{ description, password, expires, revisionMode }"
        layout="vertical"
        @submit.prevent="submitCreate"
      >
        <div class="share-content-fields">
          <h3>{{ t('proto.shareRevisionMode') }}</h3>
          <a-form-item name="description" :label="t('proto.shareDescription')">
            <a-textarea
              v-model:value="description"
              :placeholder="t('proto.shareDescriptionPlaceholder')"
              :maxlength="2000"
              :rows="2"
              show-count
            />
          </a-form-item>
          <a-form-item name="revisionMode" :label="t('proto.shareRevisionMode')">
            <a-radio-group v-model:value="revisionMode">
              <a-radio-button value="fixed">{{ t('proto.shareFixed') }}</a-radio-button>
              <a-radio-button value="latest">{{ t('proto.shareLatest') }}</a-radio-button>
            </a-radio-group>
            <p class="share-field-help">
              {{
                t(revisionMode === 'fixed' ? 'proto.shareFixedCreateHint' : 'proto.shareLatestHint')
              }}
            </p>
          </a-form-item>
        </div>
        <div class="share-access-fields">
          <h3>{{ t('proto.shareAccessTitle') }}</h3>
          <a-form-item class="share-password" name="password" :label="t('proto.password')">
            <a-input-password
              v-model:value="password"
              :placeholder="t('proto.passwordOptional')"
              autocomplete="new-password"
            />
          </a-form-item>
          <a-form-item class="share-expiry" name="expires" :label="t('proto.expiresAt')">
            <a-date-picker
              v-model:value="expires"
              show-time
              :disabled-date="(value) => value.endOf('day').valueOf() < Date.now()"
            />
            <p class="share-field-help">{{ t('proto.shareExpiryHint') }}</p>
          </a-form-item>
        </div>
        <div class="share-create-footer">
          <span class="muted">{{ t('proto.shareCustomerAccessHint') }}</span>
          <permission-button
            class="share-create-button"
            :permission="p.share.save"
            type="primary"
            :loading="task.busy.value"
            :disabled="!canCreate || creationUnknown"
            html-type="submit"
            >{{ t('proto.createShare') }}</permission-button
          >
        </div>
      </a-form>
    </section>
    <a-alert
      v-if="task.error.value && !editTarget"
      class="share-feedback"
      type="error"
      show-icon
      role="alert"
      :message="task.error.value"
    >
      <template v-if="creationUnknown" #action>
        <a-button :loading="resource.loading.value" @click="refresh">{{
          t('proto.shareCheckList')
        }}</a-button>
      </template>
    </a-alert>
    <section
      v-if="createdShare"
      ref="createdResult"
      class="share-created-result"
      aria-live="polite"
    >
      <div>
        <strong>{{ t('proto.shareCreated') }}</strong>
        <p>
          {{
            t(
              createdShare.passwordRequired
                ? 'proto.shareCreatedProtected'
                : 'proto.shareCreatedPublic',
            )
          }}
        </p>
      </div>
      <div class="share-result-actions">
        <a-button type="primary" @click="copy(createdShare, $event)">{{
          t('proto.copyShare')
        }}</a-button>
        <a :href="url(createdShare)" target="_blank" rel="noopener noreferrer">{{
          t('proto.shareOpenCustomer')
        }}</a>
      </div>
    </section>
    <load-state :loading="resource.loading.value" :error="resource.error.value" @retry="refresh">
      <a-empty v-if="!resource.data.value.length" :description="t('proto.shareEmpty')" />
      <ul v-else ref="shareList" class="share-list" :aria-label="t('proto.share')">
        <li
          v-for="record in resource.data.value"
          :key="record.id"
          class="share-row"
          :data-share-id="record.id"
        >
          <div class="share-object">
            <div class="share-row-heading">
              <strong class="share-description-text">{{ shareName(record) }}</strong>
              <a-tag class="share-status" :color="validityColors[validity(record)]">{{
                t(`proto.shareStatus.${validity(record)}`)
              }}</a-tag>
            </div>
            <text-ellipsis class="share-url" :text="url(record)" />
            <span class="share-revision-mode"
              >{{ t(record.revisionMode === 'latest' ? 'proto.shareLatest' : 'proto.shareFixed') }}
              ·
              {{
                t(
                  record.revisionMode === 'latest'
                    ? 'proto.shareLatestRowHint'
                    : record.revisionId === version?.currentRevisionId
                      ? 'proto.currentRevision'
                      : 'proto.sharePinnedRevision',
                )
              }}</span
            >
          </div>
          <dl class="share-conditions">
            <div>
              <dt>{{ t('proto.shareAccessTitle') }}</dt>
              <dd class="share-password-state">
                {{
                  t(record.passwordRequired ? 'proto.sharePasswordProtected' : 'proto.noPassword')
                }}
              </dd>
            </div>
            <div>
              <dt>{{ t('proto.expiryTime') }}</dt>
              <dd class="share-expiry-time">
                {{ record.expiresAt == null ? t('proto.shareNoExpiry') : date(record.expiresAt) }}
              </dd>
            </div>
            <div>
              <dt>{{ t('proto.shareTime') }}</dt>
              <dd class="share-created-time">{{ date(record.createdAt) }}</dd>
            </div>
          </dl>
          <div class="share-row-actions">
            <a-button
              v-if="['permanent', 'temporary'].includes(validity(record))"
              :aria-label="t('common.copy')"
              @click="copy(record, $event)"
              >{{ t('common.copy') }}</a-button
            >
            <permission-button
              v-if="!record.revoked"
              :aria-label="t('common.edit')"
              :permission="p.share.save"
              :disabled="task.busy.value"
              @click="edit(record)"
              >{{ t('common.edit') }}</permission-button
            >
            <a-dropdown
              v-if="
                permissions.can(p.share.query) ||
                permissions.can(p.share.save) ||
                permissions.can(p.share.delete)
              "
              :trigger="['click']"
              :get-popup-container="menuContainer"
              :open="moreTarget === record.id"
              @open-change="openMore(record.id, $event)"
              @popup-align="focusMoreMenu(record.id)"
            >
              <a-button
                class="share-more-trigger"
                :disabled="task.busy.value"
                aria-haspopup="menu"
                :aria-expanded="moreTarget === record.id"
                :aria-controls="`share-menu-${record.id}`"
                :aria-label="t('proto.shareMoreFor', { name: shareName(record) })"
                @keydown.esc="escapeMore(record.id, $event)"
                >{{ t('proto.shareMore') }} <down-outlined aria-hidden="true"
              /></a-button>
              <template #overlay>
                <div @keydown="navigateMore(record.id, $event)">
                  <a-menu :id="`share-menu-${record.id}`" @click="moreTarget = undefined">
                    <a-menu-item
                      v-if="permissions.can(p.share.query)"
                      key="invitations"
                      @click="invitationTarget = record"
                      >{{ t('proto.reviewInvitations') }}</a-menu-item
                    >
                    <a-menu-item
                      v-if="!record.revoked && permissions.can(p.share.save)"
                      key="review"
                      @click="reviewTarget = record"
                      >{{ t('proto.reviewSettings') }}</a-menu-item
                    >
                    <a-menu-item
                      v-if="!record.revoked && permissions.can(p.share.save)"
                      key="enabled"
                      @click="confirmAction(record, 'enabled')"
                      >{{
                        t(record.enabled ? 'proto.pauseShare' : 'proto.resumeShare')
                      }}</a-menu-item
                    >
                    <a-menu-item
                      v-if="!record.revoked && permissions.can(p.share.save)"
                      key="rotate"
                      @click="confirmAction(record, 'rotate')"
                      >{{ t('proto.rotateShare') }}</a-menu-item
                    >
                    <a-menu-item
                      v-if="!record.revoked && permissions.can(p.share.save)"
                      key="revoke"
                      danger
                      @click="confirmAction(record, 'revoke')"
                      >{{ t('proto.revokeShare') }}</a-menu-item
                    >
                    <a-menu-item
                      v-if="permissions.can(p.share.delete)"
                      key="delete"
                      danger
                      @click="confirmAction(record, 'delete')"
                      >{{ t('common.delete') }}</a-menu-item
                    >
                  </a-menu>
                </div>
              </template>
            </a-dropdown>
          </div>
        </li>
      </ul>
    </load-state>
  </a-modal>
  <share-edit-dialog
    v-if="editTarget && permissions.can(p.share.save) && projectAllows(project, 'manageShares')"
    :share="editTarget"
    :version="version"
    :busy="task.busy.value || resource.loading.value"
    :error="task.error.value"
    :conflict="editConflict"
    @reload="reloadEdit"
    @close="closeEdit"
    @save="update"
  />
  <share-copy-dialog
    v-model:password="shareCopy.enteredPassword.value"
    :open="!!shareCopy.target.value"
    :verified="shareCopy.verified.value"
    :busy="shareCopy.busy.value"
    :error="shareCopy.error.value"
    :content="shareCopy.content.value"
    :object-label="shareCopy.target.value ? shareName(shareCopy.target.value) : ''"
    :link="shareCopy.target.value ? url(shareCopy.target.value) : ''"
    @close="shareCopy.cancel"
    @verify="shareCopy.verify"
    @copy="shareCopy.copyVerified"
  />
  <review-policy-dialog
    v-if="
      reviewTarget &&
      version &&
      permissions.can(p.share.save) &&
      projectAllows(project, 'manageShares')
    "
    :share="reviewTarget"
    @close="reviewTarget = undefined"
    @saved="reviewSaved"
  />
  <review-invitations-dialog
    v-if="
      invitationTarget && permissions.can(p.share.query) && projectAllows(project, 'manageShares')
    "
    :share="invitationTarget"
    :project="project"
    @close="invitationTarget = undefined"
  />
</template>
<style scoped>
.share-context {
  display: grid;
  gap: var(--space-1);
  margin-bottom: var(--space-4);
  overflow-wrap: anywhere;
}
.share-context span,
.share-revision-mode,
.share-field-help {
  color: var(--color-muted);
}
.share-toolbar,
.share-toolbar-actions,
.share-row-heading,
.share-row-actions,
.share-result-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.share-toolbar {
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}
.share-toolbar h2 {
  margin: 0;
  font-size: var(--text-body);
}
.share-create-region {
  margin-bottom: var(--space-4);
  padding: var(--space-4);
  background: var(--color-background);
  border-radius: var(--radius);
}
.share-create {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-6);
}
.share-create h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--text-body);
}
.share-create :deep(.ant-form-item) {
  margin-bottom: var(--space-3);
  min-width: 0;
}
.share-expiry :deep(.ant-picker) {
  width: 100%;
}
.share-field-help {
  margin: var(--space-2) 0 0;
  line-height: 1.6;
}
.share-create-footer {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}
.share-feedback {
  margin-bottom: var(--space-4);
}
.share-created-result {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  padding: var(--space-4);
  background: var(--color-background);
  border-radius: var(--radius);
}
.share-created-result p {
  margin: var(--space-1) 0 0;
}
.share-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.share-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(14rem, 0.7fr) auto;
  gap: var(--space-4);
  padding: var(--space-4) 0;
  border-top: 1px solid var(--color-border);
}
.share-object {
  min-width: 0;
}
.share-row-heading {
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: var(--space-2);
}
.share-description-text {
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.share-url {
  display: block;
  max-width: 100%;
}
.share-revision-mode {
  display: block;
  margin-top: var(--space-2);
  font-size: var(--text-small);
}
.share-conditions {
  display: grid;
  align-content: start;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-small);
}
.share-conditions > div {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2);
}
.share-conditions dt {
  color: var(--color-muted);
}
.share-conditions dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.share-row-actions {
  align-items: flex-start;
  flex-wrap: wrap;
  align-content: start;
}
:global(.share-action-confirmation .ant-modal-confirm-title) {
  overflow-wrap: anywhere;
}
:global(.share-action-confirmation .ant-modal-content) {
  max-height: calc(100dvh - 8rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}
:global(.share-management-modal .ant-modal-body) {
  max-height: calc(100dvh - 13rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}
@media (max-width: 767px) {
  :global(.share-management-modal .ant-modal) {
    top: var(--space-2);
    max-width: calc(100vw - 16px);
    margin: 0 auto;
    padding-bottom: 0;
  }
  :global(.share-management-modal .ant-modal-body) {
    max-height: calc(100dvh - 6rem);
  }
  .share-create {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
  .share-create-footer {
    align-items: stretch;
    flex-direction: column;
  }
  .share-create-button {
    width: 100%;
  }
  .share-row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
  .share-conditions > div {
    grid-template-columns: 5rem minmax(0, 1fr);
  }
  .share-toolbar-actions {
    flex-wrap: wrap;
  }
  .share-row-actions {
    gap: var(--space-2);
  }
  .share-row-actions :deep(.ant-btn) {
    min-height: 2.25rem;
  }
}
</style>
