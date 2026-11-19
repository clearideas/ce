<script setup lang="ts">
import { computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import type { IconProps } from 'vuetify'
import { resolveIconLookup } from '../../icons/resolve'

// Must satisfy Vuetify's `IconComponent` contract exactly (`tag` required, `icon?: IconValue`).
// `tag` is unused: the SVG renderer supplies its own root element.
const props = defineProps<IconProps>()

const lookup = computed(() => {
  const icon = props.icon
  if (typeof icon === 'string') return resolveIconLookup(icon)
  if (Array.isArray(icon))
    return resolveIconLookup(icon.filter((part): part is string => typeof part === 'string'))
  return resolveIconLookup(undefined)
})
</script>

<template>
  <FontAwesomeIcon :icon="lookup" fixed-width />
</template>
