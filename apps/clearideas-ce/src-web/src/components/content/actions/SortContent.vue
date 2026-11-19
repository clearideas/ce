<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import { SORT_OPTIONS, useContentFilters, type ContentSortKey } from '../../../composables/useContentFilters'
import { ICONS } from '../../../icons'

/**
 * Sort control for site content. Drives the shared content-filter state, so it stays in step with
 * the list view's column headers and applies to the tile view too. Rendered as a toolbar button
 * (menu) or as menu items inside the narrow-mode overflow menu.
 */
const props = defineProps<{ showAsMenu?: boolean }>()
const { state, setSort } = useContentFilters()

const current = computed(() => SORT_OPTIONS.find(option => option.value === state.sortKey) ?? SORT_OPTIONS[0])
const directionLabel = computed(() => (state.sortOrder === 'asc' ? 'ascending' : 'descending'))
const buttonLabel = computed(() => `Sort: ${current.value.title}`)

function choose(key: ContentSortKey) {
  setSort(key)
}
</script>

<template>
  <template v-if="props.showAsMenu">
    <VListSubheader>Sort by</VListSubheader>
    <VListItem
      v-for="option in SORT_OPTIONS"
      :key="option.value"
      :active="option.value === state.sortKey"
      :title="option.title"
      :append-icon="
        option.value === state.sortKey
          ? state.sortOrder === 'asc'
            ? ICONS.chevronUp
            : ICONS.chevronDown
          : undefined
      "
      @click="choose(option.value)"
    />
  </template>
  <VMenu v-else>
    <template #activator="{ props: activatorProps }">
      <BaseButton
        v-bind="activatorProps"
        intent="tertiary"
        :prepend-icon="state.sortOrder === 'asc' ? ICONS.sortAsc : ICONS.sortDesc"
        :append-icon="ICONS.caretDown"
        :text="current.title"
        tooltip="Sort content"
        :aria-label="`${buttonLabel}, ${directionLabel}`"
        aria-haspopup="menu"
      />
    </template>
    <VList density="compact" nav aria-label="Sort by">
      <VListItem
        v-for="option in SORT_OPTIONS"
        :key="option.value"
        :active="option.value === state.sortKey"
        :title="option.title"
        :append-icon="
          option.value === state.sortKey
            ? state.sortOrder === 'asc'
              ? ICONS.chevronUp
              : ICONS.chevronDown
            : undefined
        "
        @click="choose(option.value)"
      />
    </VList>
  </VMenu>
</template>
