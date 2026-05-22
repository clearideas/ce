<script setup lang="ts">
import { computed, useSlots } from 'vue'
import StatusIcon from './StatusIcon.vue'

type Variant = 'flat' | 'outlined' | 'elevated' | 'tonal' | 'text' | 'plain'

interface Props {
  variant?: Variant
  title: string
  subtitle?: string
  icon?: string
  store?: any
  action?: string
  isInitialized?: boolean
  errorMessage?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'outlined',
  isInitialized: true,
  errorMessage: '',
  icon: 'fasl fa-gears',
})
const slots = useSlots()
const hasFooter = computed(() => Boolean(slots.footer))
</script>

<template>
  <VCard :variant="props.variant" class="settings-card">
    <VCardItem>
      <VCardTitle class="settings-card-title">
        <slot name="title">{{ props.title }}</slot>
      </VCardTitle>
      <VCardSubtitle
        v-if="$slots.subtitle || props.subtitle"
        class="wrap-text settings-card-subtitle"
      >
        <slot name="subtitle">{{ props.subtitle }}</slot>
      </VCardSubtitle>
      <template #append>
        <div class="d-flex">
          <div class="text-body-2 me-2" style="color: rgb(var(--v-theme-error))">
            {{ props.errorMessage }}
          </div>
          <slot name="append">
            <StatusIcon v-bind="props" />
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
  background: var(--ci-surface) !important;
  color: var(--ci-on-surface) !important;
  border-radius: 6px !important;
  border-color: rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.9)) !important;
  box-shadow: var(--ci-shell-shadow) !important;
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

.settings-card-title {
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
