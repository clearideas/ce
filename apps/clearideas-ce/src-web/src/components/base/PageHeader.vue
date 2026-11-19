<script setup lang="ts">
import { computed } from 'vue'
import { usePageTitle } from '../../composables/usePageTitle'

/**
 * Every routed view renders one of these. It owns the page's `<h1>` and `document.title`.
 *
 * Most CE pages use tabs or breadcrumbs as their visible header, so the heading is visually hidden
 * by default (`visible` shows it). Either way assistive technology gets a real page heading.
 */
interface Props {
  title: string
  /** Text for `document.title` when it should differ from the heading. */
  documentTitle?: string
  visible?: boolean
}

const props = withDefaults(defineProps<Props>(), { visible: false, documentTitle: undefined })
usePageTitle(computed(() => props.documentTitle ?? props.title))
</script>

<template>
  <header class="page-header" :class="{ 'page-header--visible': props.visible }">
    <h1 class="page-header__title" :class="{ 'd-sr-only': !props.visible, 'text-h4': props.visible }">
      {{ props.title }}
    </h1>
    <div v-if="props.visible && $slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header--visible {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.page-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
