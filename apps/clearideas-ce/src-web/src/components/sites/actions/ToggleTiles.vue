<script setup lang="ts">
import { useProfileStore } from '../../../stores'

interface Props {
  showAsMenu?: boolean
  size?: string
  color?: string
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
}

const props = withDefaults(defineProps<Props>(), {
  showAsMenu: false,
  size: 'default',
  color: 'primary',
  variant: 'text',
})
const profileStore = useProfileStore()
</script>

<template>
  <VMenu v-if="!props.showAsMenu">
    <template #activator="{ props: localProps }">
      <Tippy content="Toggle view" placement="top">
        <VBtn
          v-bind="localProps"
          :variant="props.variant"
          :prepend-icon="profileStore.tileView ? 'fas fa-border-all' : 'fas fa-list'"
          append-icon="fass fa-caret-down"
          :color="props.color"
          :size="props.size"
          aria-label="Toggle view"
        />
      </Tippy>
    </template>
    <VList density="compact" nav>
      <VListItem :active="profileStore.tileView" @click="profileStore.tileView = true">
        <template #prepend><VIcon size="small">fas fa-border-all</VIcon></template>
        <VListItemTitle>Tiles</VListItemTitle>
      </VListItem>
      <VListItem :active="!profileStore.tileView" @click="profileStore.tileView = false">
        <template #prepend><VIcon size="small">fas fa-list</VIcon></template>
        <VListItemTitle>List</VListItemTitle>
      </VListItem>
    </VList>
  </VMenu>
  <template v-else>
    <VListItem :active="profileStore.tileView" @click="profileStore.tileView = true">
      <template #prepend><VIcon size="small">fas fa-border-all</VIcon></template>
      <VListItemTitle>Tiles</VListItemTitle>
    </VListItem>
    <VListItem :active="!profileStore.tileView" @click="profileStore.tileView = false">
      <template #prepend><VIcon size="small">fas fa-list</VIcon></template>
      <VListItemTitle>List</VListItemTitle>
    </VListItem>
  </template>
</template>
