<script setup lang="ts">
import { ref, watch } from 'vue'

import icons from '../../../config/siteIcons'

const props = defineProps({
  modelValue: String,
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const selectedIcon = ref<string>(props.modelValue || '')

function handleIconChange(icon: string) {
  emit('update:modelValue', icon)
}

function handleIconClick(icon: string, toggle: any) {
  if (props.disabled) return
  toggle() // Invoke the toggle function to maintain default behavior
  handleIconChange(icon) // Call handleIconChange to emit events
}

watch(
  () => props.modelValue,
  newValue => {
    selectedIcon.value = newValue || ''
  },
)
</script>

<template>
  <VContainer class="px-0">
    <VItemGroup v-model="selectedIcon" :disabled="props.disabled">
      <VItem
        v-for="(icon, index) in icons"
        :key="index"
        v-slot="{ selectedClass, toggle }"
        :value="icon"
      >
        <div class="site-icon-button-wrap">
          <button
            class="site-icon-button"
            :class="[selectedClass, { disabled: props.disabled }]"
            type="button"
            :disabled="props.disabled"
            @click="handleIconClick(icon, toggle)"
          >
            <VIcon :icon="`fasl ${icon}`" size="24" />
          </button>
        </div>
      </VItem>
    </VItemGroup>
  </VContainer>
</template>

<style scoped>
:deep(.v-item-group) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(56px, 56px));
  justify-content: start;
  gap: 12px;
}

:deep(.v-item--selected.site-icon-button) {
  border-color: rgba(var(--v-theme-primary), 1);
  background: rgba(var(--v-theme-primary), 0.06);
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.08);
}

.site-icon-button-wrap {
  display: inline-flex;
  justify-content: center;
}

.site-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.38);
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.92);
  color: rgb(var(--v-theme-on-surface));
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;
}

.site-icon-button:hover:not(.disabled) {
  border-color: rgba(var(--v-theme-on-surface), 0.5);
}

.site-icon-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
