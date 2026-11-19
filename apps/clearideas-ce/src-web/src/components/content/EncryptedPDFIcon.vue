<script setup lang="ts">
/**
 * Placeholder kept for template compatibility with the list views: CE has no PDF-encryption
 * metadata, so nothing is rendered. Remove together with its call sites if it stays unused.
 */
defineProps<{ file: unknown }>()
</script>

<template>
  <span class="encrypted-pdf-icon d-none" aria-hidden="true" />
</template>
