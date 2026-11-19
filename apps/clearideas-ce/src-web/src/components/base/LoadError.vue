<script setup lang="ts">
import BaseButton from './BaseButton.vue'

/**
 * "This list could not be loaded" — shown in place of a list's empty state when its request failed,
 * so a server error never reads as "you have nothing here". `retry` re-runs the load.
 */
defineProps<{ message: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <VAlert type="error" variant="tonal" class="load-error ma-4 text-start" role="alert">
    {{ message }}
    <template #append>
      <BaseButton text="Retry" intent="tertiary" size="small" @click="$emit('retry')" />
    </template>
  </VAlert>
</template>
