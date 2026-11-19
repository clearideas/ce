<script setup lang="ts">
import { ICONS } from '../../icons'

/**
 * The app's empty state. One look everywhere: a neutral icon, a short title, one sentence of
 * guidance, and — whenever there is an obvious next step — the action that takes it (`actions` slot).
 *
 * `compact` is for empty states inside cards (dashboard tiles, settings sections).
 */
interface Props {
  title: string
  text?: string
  icon?: string
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  text: undefined,
  icon: ICONS.folder,
  compact: false,
})
</script>

<template>
  <VEmptyState
    :title="props.title"
    :text="props.text"
    class="empty-state"
    :class="{ 'empty-state--compact': props.compact }"
  >
    <template #media>
      <VIcon :icon="props.icon" class="empty-state__icon" />
    </template>
    <template v-if="$slots.default" #text><slot /></template>
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
  </VEmptyState>
</template>

<style scoped>
.empty-state {
  width: 100%;
  min-height: 320px;
  padding: 28px 24px;
}

.empty-state--compact {
  min-height: 0;
  padding: 16px;
}

.empty-state :deep(.v-empty-state__title) {
  font-weight: 600;
  letter-spacing: -0.02em;
}

.empty-state :deep(.v-empty-state__text) {
  max-width: 520px;
  margin-inline: auto;
}

.empty-state__icon {
  font-size: 48px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.empty-state--compact .empty-state__icon {
  font-size: 36px;
}

.empty-state :deep(.v-empty-state__actions) {
  gap: 8px;
}
</style>
