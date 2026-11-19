<script setup lang="ts">
import EmptyState from '../base/EmptyState.vue'
import { ICONS } from '../../icons'
</script>

<template>
  <EmptyState
    :icon="ICONS.favourite"
    title="No favourite sites"
    text="Use the star on a site to pin it here and to the navigation sidebar."
  />
</template>
