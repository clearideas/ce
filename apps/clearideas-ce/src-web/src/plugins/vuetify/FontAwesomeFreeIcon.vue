<script setup lang="ts">
import { computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { normalizeFontAwesomeFreeIcon } from '../fontawesome-compat'

const props = defineProps<{ icon?: string | string[] }>()
const normalizedIcon = computed(() => normalizeFontAwesomeFreeIcon(props.icon))
</script>

<template>
  <FontAwesomeIcon :icon="normalizedIcon" fixed-width />
</template>
