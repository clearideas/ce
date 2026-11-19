<script setup lang="ts">
import { computed } from 'vue'

interface TagItem {
  key?: string
  text: string
  color?: string
}

/**
 * A single row of tag chips. With `maxVisibleChars`, tags are shown while their combined text
 * fits the budget (at least one is always shown) and the rest collapse into a "+N" chip whose
 * tooltip lists them; screen readers get the hidden names as text. Without it, every tag renders
 * and the row clips (list rows, where the column width is the limit).
 */
const props = withDefaults(defineProps<{ items: TagItem[]; size?: string; maxVisibleChars?: number }>(), {
  size: 'x-small',
  maxVisibleChars: undefined,
})

const split = computed(() => {
  const budget = props.maxVisibleChars
  if (budget === undefined) return { visible: props.items, hidden: [] as TagItem[] }
  const visible: TagItem[] = []
  let used = 0
  for (const item of props.items) {
    if (visible.length > 0 && used + item.text.length > budget) break
    visible.push(item)
    used += item.text.length
  }
  return { visible, hidden: props.items.slice(visible.length) }
})

const hiddenNames = computed(() => split.value.hidden.map(item => item.text).join(', '))
</script>

<template>
  <div class="tag-overflow-row">
    <VChip
      v-for="item in split.visible"
      :key="item.key || item.text"
      :color="item.color || 'secondary'"
      :size="props.size"
      variant="tonal"
      >{{ item.text }}</VChip
    >
    <VChip
      v-if="split.hidden.length > 0"
      v-tippy="hiddenNames"
      class="tag-overflow-row__more"
      color="secondary"
      :size="props.size"
      variant="tonal"
      >+{{ split.hidden.length }}<span class="d-sr-only"> more: {{ hiddenNames }}</span></VChip
    >
  </div>
</template>

<style scoped>
.tag-overflow-row {
  display: flex;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  flex-wrap: nowrap;
}

.tag-overflow-row__more {
  /* Above a tile-wide link (ItemLink stretched), so its tooltip still shows on hover. */
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
}
</style>
