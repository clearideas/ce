<script setup lang="ts">
import { useDisplay } from 'vuetify'

defineProps<{
  section: string
  sections: Array<{ key?: string; label: string; icon?: string; heading?: boolean }>
}>()
defineEmits<{ select: [key: string] }>()

const { smAndDown } = useDisplay()
</script>

<template>
  <VList nav class="layout-vertical-nav settings-menu-pane">
    <template v-for="item in sections" :key="item.heading ? `heading-${item.label}` : item.key">
      <VListSubheader v-if="item.heading" class="text-uppercase text-medium-emphasis">
        {{ item.label }}
      </VListSubheader>
      <VListItem
        v-else-if="item.key"
        :active="section === item.key || (section === '' && item.key === 'profile')"
        color="primary"
        rounded="lg"
        v-tippy="smAndDown ? { content: item.label, placement: 'right' } : null"
        @click="$emit('select', item.key)"
      >
        <template #prepend><VIcon :icon="item.icon" /></template>
        <VListItemTitle>{{ item.label }}</VListItemTitle>
      </VListItem>
    </template>
  </VList>
</template>
