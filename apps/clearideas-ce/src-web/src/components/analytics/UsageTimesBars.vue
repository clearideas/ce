<script setup lang="ts">
import { computed } from 'vue'
import { useProfileStore } from '../../stores'

const props = withDefaults(defineProps<{ rows: Record<string, any>[]; loading?: boolean }>(), {
  rows: () => [],
  loading: false,
})

const profileStore = useProfileStore()
const timeZone = computed(() => profileStore.user?.attributes?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone)
const hours = computed(() => {
  const byHour = new Map<number, number>()
  for (const row of props.rows) {
    const utcHour = Number(row.hour)
    const localHour = utcHourToLocalHour(utcHour, timeZone.value)
    byHour.set(localHour, (byHour.get(localHour) ?? 0) + Number(row.count ?? 0))
  }
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${hour.toString().padStart(2, '0')}:00`,
    count: byHour.get(hour) ?? 0,
  }))
})
const maxCount = computed(() => Math.max(1, ...hours.value.map(item => item.count)))
const totalCount = computed(() => hours.value.reduce((total, item) => total + item.count, 0))
const busiestHour = computed(() => hours.value.reduce((best, item) => item.count > best.count ? item : best, hours.value[0]))

function utcHourToLocalHour(hour: number, zone: string) {
  if (!Number.isFinite(hour)) return 0
  const date = new Date()
  date.setUTCMinutes(0, 0, 0)
  date.setUTCHours(hour)

  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(date)
  const localHour = Number.parseInt(formatted, 10)
  return Number.isFinite(localHour) ? localHour : hour
}
</script>

<template>
  <div class="usage-times-report">
    <div class="usage-times-summary">
      <div class="usage-times-summary__item">
        <span>Total activity</span>
        <strong>{{ totalCount.toLocaleString() }}</strong>
      </div>
      <div class="usage-times-summary__item">
        <span>Busiest hour</span>
        <strong>{{ busiestHour?.label ?? '00:00' }}</strong>
      </div>
      <div class="usage-times-summary__item usage-times-summary__item--timezone">
        <span>Time zone</span>
        <strong>{{ timeZone }}</strong>
      </div>
    </div>

    <div v-if="props.loading" class="usage-times-loading">
      <VProgressCircular indeterminate color="primary" :size="48" :width="5" />
    </div>
    <div v-else class="usage-times-chart" aria-label="Activity by hour of day">
      <div v-for="item in hours" :key="item.hour" class="usage-times-chart__bar-wrap">
        <div class="usage-times-chart__bar-shell">
          <div
            v-tippy="{ content: `${item.label}: ${item.count.toLocaleString()} activities`, placement: 'top' }"
            class="usage-times-chart__bar"
            :class="{ 'usage-times-chart__bar--empty': item.count === 0 }"
            :style="{ height: `${Math.max(item.count === 0 ? 2 : 8, (item.count / maxCount) * 100)}%` }"
          />
        </div>
        <div class="usage-times-chart__count">{{ item.count || '' }}</div>
        <div class="usage-times-chart__label">{{ item.hour }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.usage-times-report {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.usage-times-summary {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.usage-times-summary__item {
  display: flex;
  flex-direction: column;
  min-width: 150px;
  padding: 14px 16px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.72);
}

.usage-times-summary__item span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.usage-times-summary__item strong {
  margin-top: 4px;
  font-size: 1.55rem;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.usage-times-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 260px;
}

.usage-times-chart {
  display: grid;
  grid-template-columns: repeat(24, minmax(18px, 1fr));
  align-items: end;
  gap: 8px;
  min-height: 300px;
  padding: 18px 12px 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background:
    linear-gradient(to top, rgba(var(--v-theme-on-surface), 0.055) 1px, transparent 1px),
    rgba(var(--v-theme-surface), 0.52);
  background-size: 100% 25%;
}

.usage-times-chart__bar-wrap {
  display: grid;
  grid-template-rows: 1fr auto auto;
  align-items: end;
  gap: 6px;
  height: 100%;
  min-width: 0;
}

.usage-times-chart__bar-shell {
  display: flex;
  align-items: end;
  justify-content: center;
  height: 220px;
}

.usage-times-chart__bar {
  width: 100%;
  max-width: 22px;
  min-height: 2px;
  border-radius: 999px 999px 3px 3px;
  background: linear-gradient(180deg, rgb(var(--v-theme-primary)), rgb(var(--v-theme-accent-1)));
  box-shadow: 0 8px 18px rgba(var(--v-theme-primary), 0.18);
}

.usage-times-chart__bar--empty {
  background: rgba(var(--v-theme-on-surface), 0.16);
  box-shadow: none;
}

.usage-times-chart__count,
.usage-times-chart__label {
  text-align: center;
  font-size: 0.68rem;
  line-height: 1;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  white-space: nowrap;
}

.usage-times-chart__count {
  min-height: 0.7rem;
  font-weight: 700;
}

@media (max-width: 900px) {
  .usage-times-chart {
    grid-template-columns: repeat(12, minmax(18px, 1fr));
    row-gap: 18px;
  }

  .usage-times-chart__bar-shell {
    height: 140px;
  }
}
</style>
