<script setup lang="ts">
import { computed, toRef } from 'vue'
import {
  Modal as AModal,
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  Textarea as ATextarea,
  Button as AButton,
  Alert as AAlert,
  Tag as ATag,
  Pagination as APagination,
} from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'
import { StopOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { Project, Share, ReviewInvitation } from '@/modules/protohub-manager-ui/types'
import { useReviewInvitations } from '../hooks/useReviewInvitations'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import DataTable from '@/shared/components/DataTable.vue'
import LoadState from '@/shared/components/LoadState.vue'
import ActionButton from '@/shared/components/ActionButton.vue'

const props = defineProps<{ share: Share; project?: Project }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const state = useReviewInvitations(toRef(props, 'share'), toRef(props, 'project'))
const columns = computed<TableColumnsType<ReviewInvitation>>(() => [
  { title: t('proto.reviewEmail'), dataIndex: 'maskedEmail', width: 180 },
  { title: t('common.status'), dataIndex: 'status', width: 130 },
  { title: t('proto.shareTime'), dataIndex: 'createdAt', width: 180 },
  { title: t('proto.expiryTime'), dataIndex: 'expiresAt', width: 180 },
  { title: t('common.actions'), key: 'actions', width: 80 },
])
</script>
<template>
  <a-modal
    :open="state.readable.value"
    :title="t('proto.reviewInvitations')"
    :footer="null"
    width="min(880px, calc(100vw - 24px))"
    destroy-on-close
    @cancel="emit('close')"
  >
    <section class="review-invitations stack">
      <a-alert type="info" show-icon :message="t('proto.reviewInvitationManagementHint')" />
      <a-alert
        v-if="share.revisionMode !== 'fixed'"
        type="warning"
        show-icon
        :message="t('proto.reviewInvitationFixedOnly')"
      />
      <a-alert
        v-else-if="!state.loading.value && !state.canCreate.value && state.editable.value"
        type="warning"
        show-icon
        :message="t('proto.reviewInvitationEnableFirst')"
      />
      <a-form
        v-if="state.editable.value"
        layout="vertical"
        :model="{ email: state.email.value }"
        @finish="state.create"
      >
        <a-form-item
          name="email"
          :label="t('proto.reviewInvitationRecipient')"
          :rules="[
            { required: true, type: 'email', message: t('proto.reviewInvitationEmailRequired') },
          ]"
        >
          <a-input
            v-model:value="state.email.value"
            type="email"
            autocomplete="off"
            :maxlength="254"
            :disabled="!state.canCreate.value || state.busy.value || state.loading.value"
          />
        </a-form-item>
        <a-button
          html-type="submit"
          type="primary"
          :loading="state.busy.value"
          :disabled="!state.canCreate.value || state.loading.value"
          >{{ t('proto.reviewInvitationCreate') }}</a-button
        >
      </a-form>
      <template v-if="state.link.value">
        <a-alert type="warning" show-icon :message="t('proto.reviewInvitationCopyOnce')" />
        <a-textarea
          :value="state.link.value"
          :aria-label="t('proto.reviewInvitationLink')"
          readonly
          :auto-size="{ minRows: 2, maxRows: 5 }"
        />
        <a-button @click="state.copy">{{ t('common.copy') }}</a-button>
      </template>
      <a-alert
        v-if="state.notice.value"
        role="status"
        type="warning"
        show-icon
        :message="state.notice.value"
      />
      <a-button :disabled="state.busy.value || state.loading.value" @click="state.load">{{
        t('common.refresh')
      }}</a-button>
      <load-state :loading="state.loading.value" :error="state.error.value" @retry="state.load">
        <load-state :empty="state.rows.value.length === 0">
          <data-table :rows="state.rows.value" :columns="columns">
            <template #cell="{ column, record }">
              <span v-if="column.dataIndex === 'maskedEmail'">{{ record.maskedEmail }}</span>
              <a-tag
                v-else-if="column.dataIndex === 'status'"
                :color="record.status === 'pending' ? 'processing' : 'default'"
                >{{ t(`proto.reviewInvitationStatuses.${record.status}`) }}</a-tag
              >
              <span
                v-else-if="column.dataIndex === 'createdAt' || column.dataIndex === 'expiresAt'"
                >{{ new Date(record[column.dataIndex]).toLocaleString() }}</span
              >
              <action-button
                v-else-if="column.key === 'actions' && state.editable.value"
                :label="t('proto.reviewInvitationRevoke')"
                :icon="StopOutlined"
                :permission="p.share.save"
                :disabled="state.busy.value || state.loading.value || !state.revocable(record)"
                :confirm="t('proto.reviewInvitationRevokeConfirm')"
                danger
                @action="state.revoke(record)"
              />
            </template>
          </data-table>
        </load-state>
        <a-pagination
          v-if="state.total.value > 0 || state.pageIndex.value > 0"
          class="review-invitations-pagination"
          :current="state.pageIndex.value + 1"
          :page-size="20"
          :total="state.total.value"
          :show-size-changer="false"
          :disabled="state.busy.value"
          simple
          @change="state.page"
        />
      </load-state>
      <a-button @click="emit('close')">{{ t('common.close') }}</a-button>
    </section>
  </a-modal>
</template>
<style scoped>
.review-invitations {
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  overflow-wrap: anywhere;
}
.review-invitations :deep(.ant-table-content) {
  max-width: 100%;
  overflow-x: auto;
}
.review-invitations :deep(.ant-btn) {
  max-width: 100%;
  white-space: normal;
  height: auto;
  min-height: 32px;
}
.review-invitations-pagination {
  display: flex;
  justify-content: flex-end;
}
</style>
