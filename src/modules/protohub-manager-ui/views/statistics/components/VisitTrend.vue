<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
const props = defineProps<{
  points: { date: string; visits: number | null }[]
  dateLabel: (date: string) => string
  numberLabel: (value: number) => string
}>()
const { t } = useI18n()
const maximum = computed(() => Math.max(1, ...props.points.map((point) => point.visits || 0)))
const segments = computed(() => {
  const result: string[][] = []
  let current: string[] = []
  props.points.forEach((point, index) => {
    if (point.visits === null) {
      if (current.length) result.push(current)
      current = []
      return
    }
    current.push(
      `${32 + (index / Math.max(1, props.points.length - 1)) * 536},${152 - (point.visits / maximum.value) * 128}`,
    )
  })
  if (current.length) result.push(current)
  return result
})
const hasVisits = computed(() => props.points.some((point) => (point.visits || 0) > 0))
const hasCollected = computed(() => props.points.some((point) => point.visits !== null))
const plotted = computed(() =>
  props.points.flatMap((point, index) =>
    point.visits === null
      ? []
      : [
          {
            date: point.date,
            visits: point.visits,
            x: 32 + (index / Math.max(1, props.points.length - 1)) * 536,
            y: 152 - (point.visits / maximum.value) * 128,
          },
        ],
  ),
)
</script>
<template>
  <figure class="visit-trend">
    <div v-if="hasVisits" class="trend-plot">
      <div class="trend-y-axis" aria-hidden="true">
        <span>{{ numberLabel(maximum) }}</span
        ><span>{{ numberLabel(0) }}</span>
      </div>
      <svg
        viewBox="0 0 600 180"
        preserveAspectRatio="none"
        role="img"
        :aria-label="t('proto.statisticsTrend')"
      >
        <line x1="32" y1="24" x2="568" y2="24" class="trend-grid" />
        <line x1="32" y1="88" x2="568" y2="88" class="trend-grid" />
        <line x1="32" y1="152" x2="568" y2="152" class="trend-grid" />
        <polyline
          v-for="(segment, index) in segments"
          :key="index"
          :points="segment.join(' ')"
          class="trend-line"
        />
        <circle
          v-for="point in plotted"
          :key="point.date"
          :cx="point.x"
          :cy="point.y"
          r="3"
          class="trend-point"
        >
          <title>{{ dateLabel(point.date) }}: {{ numberLabel(point.visits) }}</title>
        </circle>
      </svg>
      <div class="trend-x-axis" aria-hidden="true">
        <span>{{ dateLabel(points[0]!.date) }}</span
        ><span>{{ dateLabel(points.at(-1)!.date) }}</span>
      </div>
    </div>
    <p v-else class="trend-empty">
      {{ t(hasCollected ? 'proto.statisticsZeroVisits' : 'proto.statisticsUncollected') }}
    </p>
    <figcaption>
      <details>
        <summary>{{ t('proto.statisticsDailyValues') }}</summary>
        <div class="trend-table-scroll" tabindex="0" :aria-label="t('proto.statisticsDailyValues')">
          <table>
            <thead>
              <tr>
                <th scope="col">{{ t('proto.statisticsDate') }}</th>
                <th scope="col">{{ t('proto.statisticsVisits') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="point in points" :key="point.date">
                <th scope="row">{{ dateLabel(point.date) }}</th>
                <td>
                  {{
                    point.visits === null
                      ? t('proto.statisticsNotCollected')
                      : numberLabel(point.visits)
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </figcaption>
  </figure>
</template>
<style scoped>
.visit-trend {
  margin: 0;
  min-width: 0;
}
svg {
  display: block;
  width: 100%;
  height: 180px;
  overflow: visible;
}
.trend-plot {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  column-gap: var(--space-2);
}
.trend-y-axis,
.trend-x-axis {
  color: var(--color-muted);
  font-size: var(--text-small);
  font-variant-numeric: tabular-nums;
}
.trend-y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px 0 22px;
}
.trend-x-axis {
  display: flex;
  justify-content: space-between;
  grid-column: 2;
  gap: var(--space-3);
}
.trend-grid {
  stroke: var(--color-border);
  stroke-dasharray: 3 4;
}
.trend-line {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.trend-point {
  fill: var(--color-primary);
}
.trend-empty {
  min-height: 180px;
  display: grid;
  place-items: center;
  margin: 0;
  color: var(--color-muted);
  text-align: center;
}
summary {
  width: fit-content;
  cursor: pointer;
  color: var(--color-primary);
  padding: var(--space-2) 0;
}
.trend-table-scroll {
  max-height: 260px;
  overflow: auto;
  margin-top: var(--space-2);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
th,
td {
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}
th {
  font-weight: 500;
}
td,
th:last-child {
  text-align: right;
}
</style>
