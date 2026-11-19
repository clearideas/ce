<script setup lang="ts">
import BaseButton from '../../base/BaseButton.vue'
import { ICONS } from '../../../icons'
import type { ButtonIntent } from '../../../types/ui'
import { usePreferences } from '../../../composables/usePreferences'

interface Props {
  showAsMenu?: boolean
  size?: string
  color?: string
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  intent?: ButtonIntent
}

const props = withDefaults(defineProps<Props>(), {
  intent: 'tertiary',
  showAsMenu: false,
  size: 'default',
})
const { preferences } = usePreferences()
</script>

<template>
  <VMenu v-if="!props.showAsMenu">
    <template #activator="{ props: localProps }">
      <BaseButton
        v-bind="localProps"
        :intent="props.intent"
        :variant="props.variant"
        :color="props.color"
        :size="props.size"
        :prepend-icon="preferences.tileView ? ICONS.viewTiles : ICONS.viewList"
        :append-icon="ICONS.caretDown"
        :text="preferences.tileView ? 'Tiles' : 'List'"
        tooltip="Change view"
        :aria-label="`View: ${preferences.tileView ? 'Tiles' : 'List'}`"
      />
    </template>
    <VList density="compact" nav>
      <VListItem :active="preferences.tileView" @click="preferences.tileView = true">
        <template #prepend><VIcon size="small">fas fa-border-all</VIcon></template>
        <VListItemTitle>Tiles</VListItemTitle>
      </VListItem>
      <VListItem :active="!preferences.tileView" @click="preferences.tileView = false">
        <template #prepend><VIcon size="small">fas fa-list</VIcon></template>
        <VListItemTitle>List</VListItemTitle>
      </VListItem>
    </VList>
  </VMenu>
  <template v-else>
    <VListItem :active="preferences.tileView" @click="preferences.tileView = true">
      <template #prepend><VIcon size="small">fas fa-border-all</VIcon></template>
      <VListItemTitle>Tiles</VListItemTitle>
    </VListItem>
    <VListItem :active="!preferences.tileView" @click="preferences.tileView = false">
      <template #prepend><VIcon size="small">fas fa-list</VIcon></template>
      <VListItemTitle>List</VListItemTitle>
    </VListItem>
  </template>
</template>
