<script setup lang="ts">
import { isNavigationFailure, NavigationFailureType, useRouter, type RouteLocationRaw } from 'vue-router'

const props = defineProps<{
  tabs: Array<{
    title: string
    key: string
    to?: RouteLocationRaw
    hasIndicator?: boolean
  }>
  containerWidth?: number
  narrowBreakpoint?: number
  color?: string
  class?: string
}>()
const model = defineModel<string>({ required: true })
const router = useRouter()

/**
 * Routed tabs navigate first and only then become selected: a route guard (e.g. the unsaved-changes
 * prompt on site settings) can cancel the switch before the current panel unmounts and its state is
 * lost. `router.push` resolves once guards pass, before the destination view loads its data.
 */
async function select(key: unknown) {
  const tab = props.tabs.find(candidate => candidate.key === key)
  if (!tab) return
  if (tab.to) {
    const failure = await router.push(tab.to)
    if (isNavigationFailure(failure, NavigationFailureType.aborted)) return
  }
  model.value = tab.key
}
</script>

<template>
  <VTabs
    :model-value="model"
    :color="color ?? 'primary'"
    class="base-tabs"
    :class="$props.class"
    @update:model-value="select"
  >
    <VTab
      v-for="tab in tabs"
      :key="tab.key"
      :value="tab.key"
      center-active
      class="base-tabs__tab"
      min-width="0"
    >
      <span class="base-tabs__tab-label">
        {{ tab.title }}
        <span v-if="tab.hasIndicator" class="base-tabs__indicator" aria-hidden="true" />
      </span>
    </VTab>
  </VTabs>
</template>

<style scoped>
.base-tabs {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
}

.base-tabs :deep(.v-slide-group) {
  height: 100%;
}

.base-tabs :deep(.v-slide-group__container) {
  contain: layout style;
}

.base-tabs :deep(.v-slide-group__content) {
  height: 100%;
}

.base-tabs :deep(.v-tab__slider) {
  height: 1px;
  bottom: 0;
  box-shadow: 0 -1px 0 0 currentColor;
}

.base-tabs :deep(.v-slide-group__prev),
.base-tabs :deep(.v-slide-group__next) {
  display: none;
}

.base-tabs :deep(.v-tab.v-btn) {
  border-radius: 6px 6px 0 0;
  height: 100%;
  min-height: 100%;
  padding-top: 0;
  padding-bottom: 0;
  align-items: center;
}

/* Phones: tighter tabs so a site's four tabs and its toolbar fit a 360 px screen (the last tab was
   cut off under the toolbar). */
@media (max-width: 600px) {
  .base-tabs :deep(.v-tab.v-btn) {
    padding-inline: 10px;
  }
}

.base-tabs__tab-label {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.base-tabs__indicator {
  position: absolute;
  top: -3px;
  right: -8px;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: rgb(var(--v-theme-error));
  box-shadow: 0 0 0 1.5px rgb(var(--v-theme-surface));
}
</style>
