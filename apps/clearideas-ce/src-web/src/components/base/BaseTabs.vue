<script setup lang="ts">
import { useRouter } from 'vue-router'

defineProps<{
  tabs: Array<{
    title: string
    key: string
    to?: Record<string, unknown> | string
    hasIndicator?: boolean
  }>
  containerWidth?: number
  narrowBreakpoint?: number
  color?: string
  class?: string
}>()
const model = defineModel<string>({ required: true })
const router = useRouter()

function navigate(to?: Record<string, unknown> | string) {
  if (!to) return
  void router.push(to as any)
}
</script>

<template>
  <VTabs v-model="model" :color="color ?? 'primary'" class="base-tabs" :class="$props.class">
    <VTab
      v-for="tab in tabs"
      :key="tab.key"
      :value="tab.key"
      center-active
      class="base-tabs__tab"
      min-width="0"
      @click="navigate(tab.to)"
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
  display: none !important;
}

.base-tabs :deep(.v-tab.v-btn) {
  border-radius: 6px 6px 0 0 !important;
  height: 100%;
  min-height: 100%;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  align-items: center;
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
