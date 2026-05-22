<script setup lang="ts">
import { useDisplay } from 'vuetify'

interface MenuItem { title: string; tab?: string; icon?: string; children?: MenuItem[] }
const tab = defineModel<string>('tab', { required: true })
const openedGroup = defineModel<string[]>('openedGroup', { default: [] })
defineProps<{ menu: MenuItem[] }>()
const { smAndDown } = useDisplay()
function select(item: MenuItem) { if (item.tab) tab.value = item.tab }
</script>
<template>
  <div class="settings">
    <div class="settings-left settings-menu-pane"><VList v-model:opened="openedGroup" density="compact" nav class="layout-vertical-nav rounded" bg-color="transparent">
      <template v-for="item in menu" :key="item.tab || item.title">
        <VListGroup v-if="item.children?.length" :value="item.title"><template #activator="{ props }"><VListItem v-bind="props" v-tippy="smAndDown ? { content: item.title, placement: 'right' } : null" :prepend-icon="item.icon" :title="item.title" /></template><VListItem v-for="child in item.children" :key="child.tab || child.title" v-tippy="smAndDown ? { content: child.title, placement: 'right' } : null" :active="tab === child.tab" :prepend-icon="child.icon" :title="child.title" @click="select(child)" /></VListGroup>
        <VListItem v-else v-tippy="smAndDown ? { content: item.title, placement: 'right' } : null" :active="tab === item.tab" :prepend-icon="item.icon" :title="item.title" @click="select(item)" />
      </template>
    </VList></div>
    <div class="settings-right">
      <div class="settings-content-viewport">
        <div class="d-flex flex-column ga-3 settings-content-scroll">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>
