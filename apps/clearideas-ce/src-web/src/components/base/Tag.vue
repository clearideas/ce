<script setup lang="ts">
defineProps<{ text?: string; color?: string; size?: string; tooltip?: string; fileIcon?: string }>()
</script>
<template>
  <Tippy :content="tooltip || text || ''" placement="top">
    <VChip :color="color || 'secondary'" :size="size || 'small'" variant="tonal">
      <template v-if="$slots.prepend || fileIcon" #prepend><slot name="prepend"><VIcon v-if="fileIcon" :icon="fileIcon" size="12" /></slot></template>
      <slot>{{ text }}</slot>
    </VChip>
  </Tippy>
</template>
