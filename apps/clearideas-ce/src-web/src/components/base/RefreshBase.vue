<script setup lang="ts">
import BaseButton from './BaseButton.vue'

interface Props {
  showAsMenu?: boolean
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  onRefresh?: () => Promise<void>
  loading?: boolean
  size?: string
}

const props = withDefaults(defineProps<Props>(), {
  showAsMenu: false,
  variant: 'text',
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
    tooltip-position="top"
    icon="fas fa-arrows-rotate"
    :class="{ 'fa-spin': props.loading }"
    :variant="props.variant"
    color="primary"
    :size="props.size"
    aria-label="Refresh"
    @click="handleRefresh"
  />
  <VListItem
    v-if="props.showAsMenu"
    append-icon="fas fa-arrows-rotate"
    density="compact"
    @click="handleRefresh"
  >
    <slot name="title">
      <span class="fs-14">Refresh</span>
    </slot>
  </VListItem>
</template>
