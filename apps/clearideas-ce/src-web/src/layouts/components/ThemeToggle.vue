<script setup lang="ts">
import { useAppTheme } from '../../composables/useAppTheme'

defineProps<{
  class?: string
}>()

const { currentTheme, themeSwitcher, themeSwitcherIcon } = useAppTheme()
</script>

<template>
  <VBtn
    :icon="themeSwitcherIcon"
    variant="text"
    color="secondary"
    size="small"
    :class="['navbar-control', 'navbar-theme-btn', $props.class]"
    :aria-label="currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    v-tippy="{
      content: currentTheme === 'dark' ? 'Light mode' : 'Dark mode',
      placement: 'bottom',
    }"
    @click.stop="themeSwitcher"
  />
</template>
