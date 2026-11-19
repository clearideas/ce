<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

/**
 * The name of a list row or tile as a real link: reachable with Tab, announced as a link, opens in a
 * new tab with Ctrl/⌘/middle-click. Rows and tiles keep their mouse click on the whole item; this
 * link is the keyboard and screen-reader path to the same destination.
 *
 * - `stretched`: the link's hit area covers its nearest positioned ancestor (a tile), so the whole
 *   tile is one link while the controls inside it (checkbox, menu, favourite) sit above it and stay
 *   separately operable. The focus ring is drawn around the tile.
 * - Clicks do not bubble, so a row's own click handler does not navigate a second time.
 * - Not draggable, so dragging across a row or tile does not drag its URL.
 */
const props = defineProps<{ to: RouteLocationRaw; stretched?: boolean }>()
</script>

<template>
  <RouterLink
    :to="props.to"
    class="item-link"
    :class="{ 'item-link--stretched': props.stretched }"
    draggable="false"
    @click.stop
  >
    <slot />
  </RouterLink>
</template>

<style scoped>
.item-link {
  color: inherit;
}

.item-link--stretched::after {
  position: absolute;
  z-index: 1;
  content: '';
  inset: 0;
  border-radius: inherit;
}

.item-link--stretched:focus-visible {
  outline: none;
}

.item-link--stretched:focus-visible::after {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
  border-radius: var(--ci-border-radius);
}
</style>
