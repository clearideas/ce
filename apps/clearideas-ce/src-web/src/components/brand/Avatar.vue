<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name?: string; email?: string; size?: number }>(), { size: 32 })
const initials = computed(() => {
  const name = props.name?.trim()
  if (name) return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  return (props.email?.[0] ?? '?').toUpperCase()
})
const color = computed(() => {
  const source = `${props.name ?? ''}:${props.email ?? ''}`
  const colors = ['primary', 'accent-2', 'accent-3', 'feature', 'success']
  let total = 0
  for (const char of source) total += char.charCodeAt(0)
  return colors[total % colors.length]
})
</script>

<template>
  <VAvatar :color="color" :size="props.size" class="ci-avatar">
    <span class="ci-avatar__initials" :style="{ fontSize: `${Math.max(8, props.size * 0.4)}px` }">
      {{ initials }}
    </span>
  </VAvatar>
</template>

<style scoped>
.ci-avatar { display: inline-flex; align-items: center; justify-content: center; }
.ci-avatar__initials { line-height: 1; font-weight: 700; }
</style>
