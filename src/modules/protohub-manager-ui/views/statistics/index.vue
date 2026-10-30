<script setup lang="ts">
defineOptions({ name: 'PrototypeStatisticsView' })
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import {
  Button as AButton,
  RadioGroup as ARadioGroup,
  RadioButton as ARadioButton,
  Skeleton as ASkeleton,
  Result as AResult,
} from 'ant-design-vue'
import { ReloadOutlined } from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import { useSession } from '@/app/stores/session'
import { ApiError } from '@/shared/api/errors'
import { useResource } from '@/shared/composables/useResource'
import PageContainer from '@/shared/components/PageContainer.vue'
import { statisticsApi } from '../../api'
import { protoPermissions as p } from '../../routes/permissions'
import { projectListLocation } from '../../utils/project-navigation'
import type { PrototypeStatistics } from '../../types'
import VisitTrend from './components/VisitTrend.vue'

const { t, locale } = useI18n()
const route = useRoute(),
  router = useRouter(),
  session = useSession()
const days = computed<7 | 30>(() => (route.query.days === '30' ? 30 : 7))
const denied = ref(false)
const resource = useResource<PrototypeStatistics | undefined>(async (signal) => {
  denied.value = false
  resource.data.value = undefined
  if (!canQuery.value) return undefined
  try {
    return await statisticsApi.get(days.value, { signal, silent: true })
  } catch (cause) {
    if (!signal.aborted && cause instanceof ApiError && cause.status === 403) denied.value = true
    throw cause
  }
}, undefined)
const data = resource.data
const projectsLocation = computed(() => projectListLocation(router, session.menus))
const canQuery = computed(() => session.can(p.project.query))
const canVersions = computed(() => session.can(p.version.query))
const numberLabel = (value: number) => new Intl.NumberFormat(locale.value).format(value)
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
const collectedLabel = computed(() =>
  data.value
    ? new Intl.DateTimeFormat(locale.value, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: data.value.timeZone,
      }).format(data.value.collectedSince)
    : '',
)
const metrics = computed(() =>
  data.value
    ? [
        {
          key: 'projects',
          label: t('proto.statisticsProjects'),
          value: data.value.projectCount,
          hint: t('proto.statisticsStockScope'),
        },
        {
          key: 'versions',
          label: t('proto.statisticsVersions'),
          value: data.value.versionCount,
          hint: t('proto.statisticsLogicalVersions'),
        },
        {
          key: 'shares',
          label: t('proto.statisticsShares'),
          value: data.value.shareCount,
          hint: t('proto.statisticsManagedScope'),
        },
        {
          key: 'visits',
          label: t('proto.statisticsVisits'),
          value: data.value.visits,
          hint: t('proto.statisticsSelectedPeriod'),
        },
      ]
    : [],
)
const rankingMax = computed(() =>
  Math.max(1, ...(data.value?.ranking?.map((project) => project.visits) || [])),
)
function changeDays(value: 7 | 30) {
  void router.replace({ query: { ...route.query, days: String(value) } })
}
// Identity/action changes discard the prior user's aggregates before any replacement response.
watch(
  [days, () => session.user?.id, () => [...session.permissions].sort().join(',')],
  () => {
    resource.data.value = undefined
    void resource.load()
  },
  { immediate: true },
)
</script>
<template>
  <page-container class="statistics-page" :title="t('proto.statisticsTitle')">
    <template #actions
      ><router-link :to="projectsLocation" class="statistics-project-link">{{
        t('proto.statisticsBrowseProjects')
      }}</router-link></template
    >
    <div class="statistics-controls">
      <div>
        <p class="statistics-scope">{{ t('proto.statisticsScope') }}</p>
        <p v-if="data" class="statistics-range">
          {{ dateLabel(data.fromDate) }} – {{ dateLabel(data.toDate) }} · {{ data.timeZone }}
        </p>
      </div>
      <div class="statistics-actions">
        <a-radio-group
          :value="days"
          :aria-label="t('proto.statisticsPeriod')"
          @change="changeDays($event.target.value)"
          ><a-radio-button :value="7">{{ t('proto.statisticsSevenDays') }}</a-radio-button
          ><a-radio-button :value="30">{{
            t('proto.statisticsThirtyDays')
          }}</a-radio-button></a-radio-group
        ><a-button :loading="resource.loading.value" @click="resource.load"
          ><reload-outlined aria-hidden="true" />{{ t('common.refresh') }}</a-button
        >
      </div>
    </div>
    <a-result
      v-if="!canQuery || denied"
      status="403"
      :title="t('proto.statisticsNoAccess')"
      :sub-title="t('proto.statisticsNoAccessHint')"
    />
    <section
      v-else-if="resource.loading.value"
      class="panel"
      role="status"
      :aria-label="t('common.loading')"
    >
      <a-skeleton active :paragraph="{ rows: 8 }" />
    </section>
    <a-result
      v-else-if="resource.error.value"
      status="error"
      :title="t('proto.statisticsUnavailable')"
      :sub-title="resource.error.value"
      ><template #extra
        ><a-button @click="resource.load">{{ t('common.retry') }}</a-button
        ><router-link :to="projectsLocation">{{
          t('proto.statisticsBrowseProjects')
        }}</router-link></template
      ></a-result
    >
    <template v-else-if="data">
      <dl class="statistics-metrics panel">
        <div v-for="metric in metrics" :key="metric.key">
          <dt>{{ metric.label }}</dt>
          <dd>
            {{
              metric.value === null ? t('proto.statisticsNotAuthorized') : numberLabel(metric.value)
            }}
          </dd>
          <p>{{ metric.value === null ? t('proto.statisticsPermissionHint') : metric.hint }}</p>
        </div>
      </dl>
      <section v-if="data.projectCount === 0" class="panel statistics-empty">
        <h2>{{ t('proto.statisticsNoProjects') }}</h2>
        <p>{{ t('proto.statisticsNoProjectsHint') }}</p>
        <router-link :to="projectsLocation">{{ t('proto.statisticsBrowseProjects') }}</router-link>
      </section>
      <div v-else class="statistics-analysis">
        <section class="panel statistics-trend" aria-labelledby="statistics-trend-title">
          <header class="statistics-section-header">
            <div>
              <h2 id="statistics-trend-title">{{ t('proto.statisticsTrend') }}</h2>
              <p>{{ t('proto.statisticsManagedScope') }}</p>
            </div>
            <strong v-if="data.visits !== null" class="statistics-total">{{
              t('proto.statisticsTotal', { count: numberLabel(data.visits) })
            }}</strong>
          </header>
          <visit-trend
            v-if="data.trend"
            :points="data.trend"
            :date-label="dateLabel"
            :number-label="numberLabel"
          />
          <p v-else class="statistics-permission">{{ t('proto.statisticsSharePermission') }}</p>
        </section>
        <section class="panel statistics-ranking" aria-labelledby="statistics-ranking-title">
          <header class="statistics-section-header">
            <div>
              <h2 id="statistics-ranking-title">{{ t('proto.statisticsRanking') }}</h2>
              <p>{{ t('proto.statisticsRankingScope') }}</p>
            </div>
          </header>
          <p v-if="data.ranking === null" class="statistics-permission">
            {{ t('proto.statisticsSharePermission') }}
          </p>
          <p v-else-if="!data.ranking.length" class="statistics-permission">
            {{ t('proto.statisticsRankingEmpty') }}
          </p>
          <ol v-else class="statistics-rank-list">
            <li v-for="project in data.ranking" :key="project.projectId">
              <div class="statistics-rank-title">
                <router-link :to="{ name: 'project-detail', params: { id: project.projectId } }">{{
                  project.projectName
                }}</router-link
                ><strong>{{ numberLabel(project.visits) }}</strong>
              </div>
              <div class="statistics-bar" aria-hidden="true">
                <span :style="{ width: `${(project.visits / rankingMax) * 100}%` }" />
              </div>
              <div class="statistics-rank-actions">
                <router-link
                  v-if="canVersions"
                  :to="{ name: 'project-detail', params: { id: project.projectId } }"
                  >{{ t('proto.statisticsOpenVersions') }}</router-link
                ><router-link
                  v-if="canVersions"
                  :to="{
                    name: 'project-detail',
                    params: { id: project.projectId },
                    query: { focus: 'shares' },
                  }"
                  >{{ t('proto.statisticsOpenShares') }}</router-link
                ><router-link
                  v-else
                  :to="{ name: 'project-detail', params: { id: project.projectId } }"
                  >{{ t('proto.openProject') }}</router-link
                >
              </div>
            </li>
          </ol>
        </section>
      </div>
      <footer class="statistics-notes">
        <p>{{ t('proto.statisticsCollectedSince', { date: collectedLabel }) }}</p>
        <details>
          <summary>{{ t('proto.statisticsAbout') }}</summary>
          <p>{{ t('proto.statisticsDefinition') }}</p>
          <p>{{ t('proto.statisticsRetention', { days: data.retentionDays }) }}</p>
          <p>{{ t('proto.statisticsBestEffort') }}</p>
        </details>
      </footer>
    </template>
  </page-container>
</template>
<style scoped>
.statistics-page {
  min-width: 0;
}
.statistics-controls,
.statistics-actions,
.statistics-section-header,
.statistics-rank-title,
.statistics-rank-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.statistics-controls {
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
}
.statistics-scope {
  margin: 0;
  font-weight: 500;
}
.statistics-range,
.statistics-section-header p,
.statistics-notes,
.statistics-metrics p {
  color: var(--color-muted);
  font-size: var(--text-small);
}
.statistics-range {
  margin: var(--space-1) 0 0;
}
.statistics-actions {
  flex-wrap: wrap;
  justify-content: flex-start;
}
.statistics-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-6);
  margin: 0 0 var(--space-6);
}
.statistics-metrics > div {
  min-width: 0;
}
dt {
  font-weight: 500;
}
dd {
  margin: var(--space-2) 0;
  font-size: 28px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.statistics-metrics p {
  margin: 0;
}
.statistics-analysis {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
  gap: var(--space-6);
}
.statistics-analysis > section {
  min-width: 0;
}
h2 {
  margin: 0;
  font-size: 17px;
}
.statistics-section-header {
  align-items: flex-start;
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
}
.statistics-section-header p {
  margin: var(--space-1) 0 0;
}
.statistics-total {
  font-size: var(--text-small);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.statistics-permission {
  margin: var(--space-6) 0;
  color: var(--color-muted);
}
.statistics-rank-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--space-6);
}
.statistics-rank-title {
  align-items: baseline;
}
.statistics-rank-title a {
  color: var(--color-text);
  font-weight: 500;
  overflow-wrap: anywhere;
  min-width: 0;
}
.statistics-rank-title strong {
  flex: none;
  font-variant-numeric: tabular-nums;
}
.statistics-bar {
  height: 5px;
  background: var(--color-background);
  margin-top: var(--space-2);
  border-radius: var(--radius);
  overflow: hidden;
}
.statistics-bar span {
  display: block;
  height: 100%;
  background: var(--color-primary);
}
.statistics-rank-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-top: var(--space-2);
  font-size: var(--text-small);
}
.statistics-notes {
  margin-top: var(--space-4);
  line-height: 1.7;
}
.statistics-notes p {
  margin: var(--space-2) 0;
}
summary {
  cursor: pointer;
  width: fit-content;
  color: var(--color-primary);
  padding: var(--space-1) 0;
}
.statistics-empty p {
  color: var(--color-muted);
}
.statistics-project-link,
.statistics-rank-actions a {
  padding-block: var(--space-2);
}
@media (max-width: 1000px) {
  .statistics-analysis {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 600px) {
  .statistics-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-6) var(--space-4);
    padding: var(--space-4);
  }
  .statistics-analysis > section {
    padding: var(--space-4);
  }
  .statistics-actions {
    width: 100%;
    justify-content: space-between;
  }
  dd {
    font-size: 25px;
  }
  .statistics-rank-actions a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
}
</style>
