<script setup lang="ts">
interface TagItem { key?: string; text: string; color?: string }
const props = withDefaults(defineProps<{ items: TagItem[]; size?: string; maxVisibleChars?: number }>(), { size: 'x-small', maxVisibleChars: 24 })
</script>
<template>
  <div class="tag-overflow-row">
    <VChip v-for="item in props.items" :key="item.key || item.text" :color="item.color || 'secondary'" :size="props.size" variant="tonal">{{ item.text }}</VChip>
  </div>
</template>
<style scoped>
.tag-overflow-row { display: flex; gap: 4px; min-width: 0; overflow: hidden; flex-wrap: nowrap; }
</style>
