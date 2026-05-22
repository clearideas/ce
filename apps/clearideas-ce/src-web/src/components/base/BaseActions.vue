<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'

interface Props {
  containerWidth?: number
  narrowBreakpoint?: number
  forceNarrow?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  forceNarrow: false,
})

const { mobile } = useDisplay()

const isNarrow = computed(() => {
  if (props.forceNarrow === true) return true
  if (props.containerWidth !== undefined && props.narrowBreakpoint !== undefined && props.containerWidth > 0) {
    return props.containerWidth < props.narrowBreakpoint
  }
  return mobile.value
})
</script>

<template>
  <div class="base-actions">
    <slot name="primary" :is-narrow="isNarrow" />
    <slot v-if="!isNarrow" />
    <slot v-else name="narrow" />
    <slot name="persistent" />
  </div>
</template>

<style scoped>
.base-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.base-actions :deep(.v-btn) {
  min-height: 36px !important;
}

.base-actions :deep(.v-btn--icon) {
  width: 36px !important;
  height: 36px !important;
}

.base-actions :deep(.v-btn--icon .v-icon),
.base-actions :deep(.v-btn--icon .svg-inline--fa) {
  font-size: 18px !important;
}
</style>
