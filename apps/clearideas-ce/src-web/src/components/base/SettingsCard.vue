<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { useDisplay } from 'vuetify'
import StatusIcon from './StatusIcon.vue'
import type { ActionStore } from '../../types/ui'

type Variant = 'flat' | 'outlined' | 'elevated' | 'tonal' | 'text' | 'plain'

interface Props {
  variant?: Variant
  title: string
  subtitle?: string
  icon?: string
  /** Optional store factory + action name that drive the header status icon. */
  store?: () => ActionStore | undefined
  action?: string
  isInitialized?: boolean
  errorMessage?: string
  /** The card's form differs from its saved state; shows an "Unsaved changes" marker. */
  dirty?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'outlined',
  isInitialized: true,
  errorMessage: '',
  icon: 'fas fa-gears',
  dirty: false,
})
const slots = useSlots()
/** Phones: the "Unsaved changes" marker moves under the subtitle so it does not squeeze the title. */
const { xs } = useDisplay()
const hasFooter = computed(() => Boolean(slots.footer))
</script>

<template>
  <VCard :variant="props.variant" class="settings-card">
    <VCardItem>
      <VCardTitle tag="h2" class="settings-card-title">
        <slot name="title">{{ props.title }}</slot>
      </VCardTitle>
      <VCardSubtitle v-if="$slots.subtitle || props.subtitle" class="wrap-text settings-card-subtitle">
        <slot name="subtitle">{{ props.subtitle }}</slot>
      </VCardSubtitle>
      <VChip
        v-if="props.dirty && xs"
        size="x-small"
        color="warning"
        variant="flat"
        class="settings-card__dirty mt-2"
      >
        Unsaved changes
      </VChip>
      <template #append>
        <div class="d-flex align-center ga-2">
          <VChip
            v-if="props.dirty && !xs"
            size="x-small"
            color="warning"
            variant="flat"
            class="settings-card__dirty"
          >
            Unsaved changes
          </VChip>
          <div v-if="props.errorMessage" class="text-body-2 text-error" role="alert">
            {{ props.errorMessage }}
          </div>
          <slot name="append">
            <StatusIcon :icon="props.icon" :store="props.store" :action="props.action" />
          </slot>
        </div>
      </template>
    </VCardItem>

    <VCardText v-if="props.isInitialized">
      <slot name="default"></slot>

      <slot name="content"></slot>

      <VCardActions v-if="hasFooter" class="settings-card-footer settings-card-footer--inline">
        <slot name="footer"></slot>
      </VCardActions>
    </VCardText>
  </VCard>
</template>

<style scoped lang="scss">
.settings-card {
  background: var(--ci-surface);
  color: var(--ci-on-surface);
  border-radius: 6px;
  border-color: rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.9));
  box-shadow: var(--ci-shell-shadow);
}

.settings-card :deep(.v-card-item) {
  align-items: flex-start;
}

.settings-card :deep(.v-card-item__content) {
  flex: 1 1 auto;
  min-width: 0;
  padding-inline-end: 20px;
}

.settings-card :deep(.v-card-item__append) {
  align-self: flex-start;
  margin-top: 2px;
  margin-inline-start: 20px;
  flex: 0 0 auto;
}

/* An h2 (page h1 → card h2 → section h3); the UA heading margin is not part of the design. */
.settings-card-title {
  margin: 0;
  font-size: var(--ci-settings-card-title-size, 1.125rem);
  line-height: var(--ci-settings-card-title-line-height, 1.45);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.settings-card-subtitle {
  margin-top: 4px;
  font-size: var(--ci-settings-card-subtitle-size, 0.95rem);
  line-height: var(--ci-settings-card-subtitle-line-height, 1.5);
}

.settings-card :deep(.v-card-text) {
  padding-top: 6px;
}

.settings-card-footer {
  justify-content: flex-start;
  gap: 12px;
  padding: 1.25rem 0 0;
}

.settings-card-footer :deep(.v-btn) {
  margin-top: 0;
}
</style>
