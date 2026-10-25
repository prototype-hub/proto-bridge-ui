<script setup lang="ts">
import { computed, toRef, shallowRef } from 'vue'
import {
  Drawer as ADrawer,
  ConfigProvider as AConfigProvider,
  Alert as AAlert,
  List as AList,
  ListItem as AListItem,
  Tag as ATag,
  Pagination as APagination,
  Button as AButton,
  Select as ASelect,
} from 'ant-design-vue'
import { StopOutlined, CheckCircleOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import type { Project } from '@/modules/protohub-manager-ui/types'
import { useReviewGuests } from '@/modules/protohub-manager-ui/views/project/hooks/useReviewGuests'
import { protoPermissions as p } from '@/modules/protohub-manager-ui/routes/permissions'
import ActionButton from '@/shared/components/ActionButton.vue'
import LoadState from '@/shared/components/LoadState.vue'

const props = defineProps<{ open: boolean; project?: Project }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const state = useReviewGuests(toRef(props, 'project'), toRef(props, 'open'))
const current = computed(() => state.pageIndex.value + 1)
const container = shallowRef<HTMLElement>()
// Keep confirmations with their moving drawer, instead of aligning a body portal to an animated anchor.
const popupContainer = () => container.value || document.body
</script>
<template>
  <a-drawer
    :open="open && state.readable.value"
    :title="t('proto.reviewGuests')"
    width="min(720px, 100vw)"
    :destroy-on-close="true"
    @close="emit('close')"
  >
    <a-config-provider :get-popup-container="popupContainer">
      <section
        ref="container"
        class="review-guests stack"
        role="dialog"
        aria-modal="true"
        :aria-label="t('proto.reviewGuests')"
      >
        <label class="review-guests-filter">
          <span>{{ t('proto.reviewVerificationLevel') }}</span>
          <a-select
            v-model:value="state.verificationLevel.value"
            :aria-label="t('proto.reviewVerificationLevel')"
            :options="[
              { value: 'email', label: t('proto.reviewEmailVerified') },
              { value: 'unverified', label: t('proto.reviewUnverified') },
            ]"
          />
        </label>
        <a-alert
          :type="state.verificationLevel.value === 'email' ? 'info' : 'warning'"
          show-icon
          :message="
            t(
              state.verificationLevel.value === 'email'
                ? 'proto.reviewGuestsHint'
                : 'proto.reviewUnverifiedGuestsHint',
            )
          "
        />
        <a-alert
          v-if="state.notice.value"
          type="info"
          show-icon
          :message="state.notice.value"
          role="status"
        />
        <a-button :disabled="state.busy.value || state.loading.value" @click="state.load">
          {{ t('common.refresh') }}
        </a-button>
        <load-state :loading="state.loading.value" :error="state.error.value" @retry="state.load">
          <load-state :empty="state.rows.value.length === 0">
            <a-list :data-source="state.rows.value">
              <template #renderItem="{ item }">
                <a-list-item>
                  <div class="review-guest">
                    <div class="review-guest-heading">
                      <strong>{{ item.displayName }}</strong>
                      <a-tag :color="item.enabled ? 'green' : 'red'">
                        {{
                          t(item.enabled ? 'proto.reviewGuestEnabled' : 'proto.reviewGuestDisabled')
                        }}
                      </a-tag>
                      <action-button
                        v-if="state.editable.value"
                        :label="
                          t(item.enabled ? 'proto.reviewGuestDisable' : 'proto.reviewGuestEnable')
                        "
                        :icon="item.enabled ? StopOutlined : CheckCircleOutlined"
                        :permission="p.share.save"
                        :danger="item.enabled"
                        :disabled="state.busy.value || state.loading.value || state.isExpired(item)"
                        :confirm="
                          t(
                            item.verificationLevel === 'unverified'
                              ? item.enabled
                                ? 'proto.reviewUnverifiedDisableConfirm'
                                : 'proto.reviewUnverifiedEnableConfirm'
                              : item.enabled
                                ? 'proto.reviewGuestDisableConfirm'
                                : 'proto.reviewGuestEnableConfirm',
                          )
                        "
                        @action="state.setEnabled(item)"
                      />
                    </div>
                    <div v-if="item.maskedEmail">{{ item.maskedEmail }}</div>
                    <div v-if="item.company">{{ item.company }}</div>
                    <div class="review-guest-verification">
                      <a-tag :color="item.verificationLevel === 'email' ? 'green' : 'warning'">{{
                        t(
                          item.verificationLevel === 'email'
                            ? 'proto.reviewEmailVerified'
                            : 'proto.reviewUnverified',
                        )
                      }}</a-tag>
                    </div>
                    <template v-if="item.verificationLevel === 'unverified'">
                      <div v-if="item.expiresAt">
                        {{
                          t('proto.reviewExpires', {
                            time: new Date(item.expiresAt).toLocaleString(),
                          })
                        }}
                      </div>
                      <div v-if="state.isExpired(item)">
                        {{ t('proto.reviewUnverifiedExpired') }}
                      </div>
                    </template>
                  </div>
                </a-list-item>
              </template>
            </a-list>
          </load-state>
          <a-pagination
            v-if="state.total.value > 0 || state.pageIndex.value > 0"
            class="review-guests-pagination"
            :current="current"
            :page-size="state.pageSize.value"
            :total="state.total.value"
            :show-size-changer="false"
            :disabled="state.busy.value"
            simple
            @change="state.page"
          />
        </load-state>
        <a-button @click="emit('close')">{{ t('common.close') }}</a-button>
      </section>
    </a-config-provider>
  </a-drawer>
</template>
<style scoped>
.review-guests-pagination {
  display: flex;
  justify-content: flex-end;
  margin-block: var(--space-3);
}
.review-guests {
  position: relative;
  grid-template-columns: minmax(0, 1fr);
}
.review-guests-filter {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-2);
}
.review-guests,
.review-guest {
  min-width: 0;
  overflow-wrap: anywhere;
}
.review-guest {
  width: 100%;
}
.review-guest-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.review-guest-heading strong {
  flex: 1;
  min-width: 0;
}
.review-guest-verification {
  color: var(--color-muted);
}
</style>
