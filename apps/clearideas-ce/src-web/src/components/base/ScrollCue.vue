<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  up: boolean
  down: boolean
}

const props = defineProps<Props>()

const visible = computed(() => props.up || props.down)
const icon = computed(() =>
  props.up && !props.down ? 'fasl fa-chevron-up' : 'fasl fa-chevron-down',
)
</script>

<template>
  <div v-if="visible" class="scroll-cue">
    <VIcon :icon="icon" size="14" />
  </div>
</template>

<style scoped>
.scroll-cue {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.54);
  min-height: 18px;
  transition: opacity 0.15s ease;
}
</style>
