<script setup lang="ts">
import { computed } from 'vue'
import { AVATAR_COLORS, avatarInitials } from '../../config/avatar'

/**
 * The app's avatar (plan 2.8): up to two initials, a colour picked deterministically from the
 * identity (config/avatar.ts), initials scaled to the size. Decorative by default — it always sits
 * next to the person's name or inside a labelled control; pass `label` when it stands alone.
 */
const props = withDefaults(defineProps<{ name?: string; email?: string; size?: number; label?: string }>(), {
  size: 32,
  label: undefined,
})
const initials = computed(() => avatarInitials(props.name, props.email))
const color = computed(() => {
  const source = `${props.name ?? ''}:${props.email ?? ''}`
  const colors = AVATAR_COLORS
  let total = 0
  for (const char of source) total += char.charCodeAt(0)
  return colors[total % colors.length]
})
</script>

<template>
  <VAvatar
    :color="color"
    :size="props.size"
    class="ci-avatar"
    :role="props.label ? 'img' : undefined"
    :aria-label="props.label"
    :aria-hidden="props.label ? undefined : 'true'"
  >
    <span class="ci-avatar__initials" :style="{ fontSize: `${Math.max(8, props.size * 0.4)}px` }">
      {{ initials }}
    </span>
  </VAvatar>
</template>

<style scoped>
.ci-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ci-avatar__initials {
  line-height: 1;
  font-weight: 700;
}
</style>
