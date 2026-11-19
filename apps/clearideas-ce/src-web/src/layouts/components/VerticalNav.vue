<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { ICONS } from '../../icons'
import { useContentStore, useSiteStore } from '../../stores'
import { useProfileStore } from '../../stores'
import VerticalNavLink from './VerticalNavLink.vue'
import type { NavMenuItem } from './utils'
import type { Site } from '../../types/domain'

const isDrawerOpen = defineModel<boolean>('isDrawerOpen', { default: false })
const isVerticalMenuMini = defineModel<boolean>('isVerticalMenuMini', { default: false })
const { lgAndUp } = useDisplay()
const siteStore = useSiteStore()
const profileStore = useProfileStore()
const contentStore = useContentStore()
const { sites } = storeToRefs(siteStore)
const OpenedGroup = ref<string[]>([])

const settings: NavMenuItem = {
  name: 'Settings',
  icon: ICONS.settings,
  to: { name: 'settings' },
}

const VerticalMenuItems = computed<NavMenuItem[]>(() => [
  { name: 'Sites', icon: ICONS.sites, to: { name: 'sites' } },
  { name: 'Ask', icon: ICONS.ask, to: { name: 'ask' } },
  { name: 'Users', icon: ICONS.users, to: { name: 'users' } },
  { name: 'Agents', icon: ICONS.agents, to: { name: 'agents' } },
  { name: 'Analytics', icon: ICONS.analytics, to: { name: 'analytics' } },
])

const verticalItemsWithFavourites = computed(() => {
  const menuItems: NavMenuItem[] = [...VerticalMenuItems.value]
  const favourites = profileStore.user?.attributes?.sites?.favourites ?? []
  const favouriteMenuItems: NavMenuItem[] = [...sites.value]
    .sort((a: Site, b: Site) => a.name.localeCompare(b.name))
    .filter(site => favourites.includes(site.id))
    .map(site => ({
      name: site.name,
      icon: (site.icon && `fas ${site.icon}`) || ICONS.site,
      avatar: site.attributes?.media?.icon?.dataUrl ?? undefined,
      to: { name: 'site', params: { siteId: site.id } },
      onClick: () => {
        contentStore.activeTab = 'content'
      },
    }))

  if (favouriteMenuItems.length !== 0) {
    menuItems.push({ heading: 'Favourites' }, ...favouriteMenuItems)
  }

  return menuItems
})

function handleGroupClose() {
  OpenedGroup.value = ['']
}
</script>

<template>
  <!-- A plain container: the two lists inside are the named navigation landmarks ("Main", "Settings"). -->
  <VNavigationDrawer
    :rail="lgAndUp ? isVerticalMenuMini : false"
    :expand-on-hover="lgAndUp ? isVerticalMenuMini : false"
    :model-value="lgAndUp ? true : isDrawerOpen"
    width="260"
    rail-width="59"
    :permanent="lgAndUp"
    class="layout-vertical-nav"
    tag="div"
    disable-resize-watcher
  >
    <VList
      v-model:opened="OpenedGroup"
      density="compact"
      open-strategy="single"
      nav
      role="navigation"
      aria-label="Main"
    >
      <template v-for="navItem in verticalItemsWithFavourites" :key="navItem.title ?? navItem.name">
        <VListSubheader v-if="navItem.heading" class="text-uppercase text-medium-emphasis">
          {{ navItem.heading }}
        </VListSubheader>
        <VDivider aria-hidden="true" v-if="navItem.divider" />
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
      <VList density="compact" nav role="navigation" aria-label="Settings">
        <VerticalNavLink :nav-item="settings" :is-vertical-menu-mini="isVerticalMenuMini" />
      </VList>
    </template>
  </VNavigationDrawer>
</template>
