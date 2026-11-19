<script setup lang="ts">
import EmptyState from '../base/EmptyState.vue'
import NewSite from './actions/NewSite.vue'
import { ICONS } from '../../icons'

/** Shown on the Sites page when the user has no (owned) sites yet. */
defineProps<{ owned?: boolean }>()
</script>

<template>
  <EmptyState
    :icon="ICONS.site"
    :title="owned ? 'You do not own any sites yet' : 'No sites yet'"
    text="Create your first site to start organizing content and inviting people."
  >
    <template #actions>
      <NewSite text="New site" intent="primary" :prepend-icon="ICONS.addCircle" />
    </template>
  </EmptyState>
</template>
