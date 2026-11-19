<script setup lang="ts">
import BaseButton from './BaseButton.vue'
import { ICONS } from '../../icons'

interface Props {
  showAsMenu?: boolean
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  onRefresh?: () => Promise<void>
  loading?: boolean
  size?: string
}

const props = withDefaults(defineProps<Props>(), {
  showAsMenu: false,
  onRefresh: async () => {},
  loading: false,
  size: 'default',
})

const handleRefresh = async () => {
  try {
    await props.onRefresh()
  } catch {}
}
</script>

<template>
  <BaseButton
    v-if="!props.showAsMenu"
    tooltip="Refresh"
    :icon="ICONS.refresh"
    :class="{ 'fa-spin': props.loading }"
    intent="tertiary"
    :variant="props.variant"
    :size="props.size"
    aria-label="Refresh"
    @click="handleRefresh"
  />
  <VListItem v-if="props.showAsMenu" :append-icon="ICONS.refresh" density="compact" @click="handleRefresh">
    <slot name="title">
      <span class="refresh-base__label">Refresh</span>
    </slot>
  </VListItem>
</template>

<style scoped>
.refresh-base__label {
  font-size: 14px;
}
</style>
