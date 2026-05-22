<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ data: Record<string, any>[]; valueKey?: string }>(), {
  data: () => [],
  valueKey: 'viewCount',
})

const maxValue = computed(() => Math.max(1, ...props.data.map(item => Number(item[props.valueKey] ?? item.count ?? 0))))
</script>

<template>
  <div class="dashboard-horizontal-bar">
    <div v-for="(item, index) in props.data" :key="item.id ?? item.name ?? index" class="dashboard-horizontal-bar__row">
      <div class="dashboard-horizontal-bar__label">
        <span>{{ item.name ?? 'Unknown' }}</span>
        <strong>{{ Number(item[props.valueKey] ?? item.count ?? 0).toLocaleString() }}</strong>
      </div>
      <div class="dashboard-horizontal-bar__track">
        <div class="dashboard-horizontal-bar__fill" :style="{ width: `${(Number(item[props.valueKey] ?? item.count ?? 0) / maxValue) * 100}%` }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-horizontal-bar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  padding-top: 8px;
}

.dashboard-horizontal-bar__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dashboard-horizontal-bar__label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 0.86rem;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.dashboard-horizontal-bar__label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-horizontal-bar__label strong {
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dashboard-horizontal-bar__track {
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.dashboard-horizontal-bar__fill {
  height: 100%;
  min-width: 4px;
  border-radius: inherit;
  background: linear-gradient(90deg, rgb(var(--v-theme-primary)), rgb(var(--v-theme-accent-1)));
}
</style>
