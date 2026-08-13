<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { useContentStore, useSiteStore } from '../../stores'
import { useProfileStore } from '../../stores'
import VerticalNavLink from './VerticalNavLink.vue'

const isDrawerOpen = defineModel<boolean>('isDrawerOpen', { default: false })
const isVerticalMenuMini = defineModel<boolean>('isVerticalMenuMini', { default: false })
const { lgAndUp } = useDisplay()
const siteStore = useSiteStore()
const profileStore = useProfileStore()
const contentStore = useContentStore()
const { sites } = storeToRefs(siteStore)
const OpenedGroup = ref<string[]>([])

const settings = {
  name: 'Settings',
  icon: 'fasds fa-cog',
  to: { name: 'settings' },
}

const VerticalMenuItems = computed(() => [
  { name: 'Sites', icon: 'fasds fa-home', to: { name: 'sites' } },
  { name: 'Users', icon: 'fasds fa-users', to: { name: 'users' } },
  { name: 'Agents', icon: 'fasds fa-robot', to: { name: 'agents' } },
  { name: 'Analytics', icon: 'fasds fa-chart-line', to: { name: 'analytics' } },
])

const verticalItemsWithFavourites = computed(() => {
  const menuItems: any[] = []

  VerticalMenuItems.value.map(item => {
    return menuItems.push(item)
  })

  const favouriteMenuItems: any[] = []

  const sortedSites: any[] = []
  sites.value.forEach(site => {
    sortedSites.push(site)
  })
  sortedSites.sort((a, b) => a.name.localeCompare(b.name))

  sortedSites
    .filter(site => (profileStore.user?.attributes?.sites?.favourites ?? []).includes(site.id))
    .forEach(site => {
    favouriteMenuItems.push({
      name: site.name,
      icon: (site.icon && `fasl ${site.icon}`) || 'fasl fa-folder-open',
      avatar: site.attributes?.media?.icon?.dataUrl ?? undefined,
      to: { name: 'site', params: { siteId: site.id } },
      onClick: () => {
        contentStore.activeTab = 'content'
      },
    })
  })

  if (favouriteMenuItems.length !== 0) {
    menuItems.push({ heading: 'Favourites' })
    favouriteMenuItems.forEach((item: any) => {
      menuItems.push(item)
    })
  }

  return menuItems
})

function handleGroupClose() {
  OpenedGroup.value = ['']
}
</script>

<template>
  <VNavigationDrawer
    :rail="lgAndUp ? isVerticalMenuMini : false"
    :expand-on-hover="lgAndUp ? isVerticalMenuMini : false"
    :model-value="lgAndUp ? true : isDrawerOpen"
    width="260"
    rail-width="59"
    :permanent="lgAndUp"
    class="layout-vertical-nav"
    disable-resize-watcher
  >
    <VList v-model:opened="OpenedGroup" density="compact" open-strategy="single" nav>
      <template
        v-for="navItem in verticalItemsWithFavourites"
        :key="navItem.title ?? navItem.name"
      >
        <VListSubheader v-if="navItem.heading" class="text-uppercase text-medium-emphasis">
          {{ navItem.heading }}
        </VListSubheader>
        <VDivider v-if="navItem.divider" />
        <VerticalNavLink
          v-else
          :key="`nav-${navItem.name}`"
          :nav-item="navItem"
          :is-vertical-menu-mini="isVerticalMenuMini"
          @close-group="handleGroupClose"
        />
      </template>
    </VList>
    <template #append>
      <VList density="compact" nav>
        <VerticalNavLink
          :nav-item="settings"
          :is-vertical-menu-mini="isVerticalMenuMini"
        />
      </VList>
    </template>
  </VNavigationDrawer>
</template>
