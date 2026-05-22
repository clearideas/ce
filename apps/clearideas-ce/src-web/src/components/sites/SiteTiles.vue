<script setup lang="ts">
import { DateTime } from 'luxon'
import { computed } from 'vue'
import TagOverflowRow from '../base/TagOverflowRow.vue'
import { useGhostItems } from '../../composables'
import { useProfileStore, useSiteStore } from '../../stores'
import FavouriteEmptyState from './FavouritesEmptyState.vue'
import SiteEmptyState from './SiteEmptyState.vue'
import SiteInfoIcons from './SiteInfoIcons.vue'
import SiteTileLoadingState from './SiteTileLoadingState.vue'

const siteStore = useSiteStore()
const profileStore = useProfileStore()
const itemCount = computed(() => siteStore.sites.length)
const { ghostCount } = useGhostItems({ tileWidth: 250, containerSelector: '.site-tiles', itemCount })
const ghostItems = computed(() => Array.from({ length: ghostCount.value }, (_, i) => i + 1))
const getLatestUpdatedRelativeTime = (site: any) => {
  const value = site.attributes?.latestUpdatedAt ?? site.updatedAt ?? site.createdAt
  return value ? DateTime.fromISO(String(value)).toRelative() ?? '' : ''
}
const filteredItems = computed(() => {
  if (siteStore.activeTab === 'favourites') {
    const favourites = profileStore.user?.attributes?.sites?.favourites ?? []
    return siteStore.sitesWithAttributes.filter(site => favourites.includes(site.id))
  }
  if (siteStore.activeTab === 'owned') return siteStore.sitesWithAttributes.filter(site => site.owned === true)
  return siteStore.sitesWithAttributes
})
</script>

<template>
  <div class="site-tiles">
    <SiteTileLoadingState v-if="siteStore.loadingSites" />
    <VCard
      v-else
      v-for="site in filteredItems"
      :key="site.id"
      :to="{ name: 'site', params: { siteId: site.id } }"
      class="site-tile-item"
      variant="flat"
      :ripple="false"
    >
      <div class="icon">
        <VImg v-if="site.attributes?.media?.icon?.dataUrl" :src="site.attributes.media.icon.dataUrl" contain height="90" width="230" />
        <div v-else class="d-flex align-center justify-center" style="height: 90px; width: 90px">
          <VIcon :icon="(site.icon && `fasl ${site.icon}`) || 'fasl fa-folder-open'" size="xxx-large" />
        </div>
      </div>
      <div class="title-wrapper"><div class="title">{{ site.name }}</div></div>
      <div v-if="(site.tags ?? []).length > 0" class="site-tile-tags">
        <TagOverflowRow :items="(site.tags ?? []).map(tag => ({ key: tag, text: tag, color: 'secondary' }))" size="x-small" :max-visible-chars="18" />
      </div>
      <div class="tile-footer">
        <div class="subtitle">{{ getLatestUpdatedRelativeTime(site) }}</div>
        <SiteInfoIcons :item="site" class="info-icons" />
      </div>
    </VCard>
    <template v-if="!siteStore.loadingSites"><div v-for="n in ghostItems" :key="`ghost-${n}`" class="ghost"></div></template>
    <SiteEmptyState v-if="['all', 'owned'].includes(siteStore.activeTab) && !siteStore.loadingSites && filteredItems.length === 0" />
    <FavouriteEmptyState v-if="siteStore.activeTab === 'favourites' && !siteStore.loadingSites && filteredItems.length === 0" />
  </div>
</template>

<style scoped>
.site-tile-item { position: relative; }
.site-tile-tags { width: 100%; padding: 0 8px 32px; min-height: 24px; display: flex; justify-content: flex-start; box-sizing: border-box; }
.tile-footer { position: absolute; right: 10px; bottom: 10px; left: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tile-footer > .subtitle { flex: 1 1 auto; min-width: 0; padding: 0 12px 0 0; }
.tile-footer > :deep(.info-icons) { width: auto; justify-content: flex-end; padding: 0; margin: 0; overflow: visible; }
.tile-footer > :deep(.info-icon:last-child) { padding-right: 2px; }
.site-tile-tags :deep(.tag-overflow-row) { justify-content: flex-start; }
</style>
