<script setup lang="ts">
import { DateTime } from 'luxon'
import { computed, ref, watch } from 'vue'
import ItemLink from '../base/ItemLink.vue'
import LoadError from '../base/LoadError.vue'
import TableFooter from '../base/TableFooter.vue'
import TagOverflowRow from '../base/TagOverflowRow.vue'
import { useGhostItems } from '../../composables'
import { usePreferences } from '../../composables/usePreferences'
import { useSiteFilters } from '../../composables/useSiteFilters'
import { useSiteStore } from '../../stores'
import type { Site } from '../../types/domain'
import FavouriteEmptyState from './FavouritesEmptyState.vue'
import SiteEmptyState from './SiteEmptyState.vue'
import SiteInfoIcons from './SiteInfoIcons.vue'
import SiteTileLoadingState from './SiteTileLoadingState.vue'

const siteStore = useSiteStore()
const { preferences } = usePreferences()
const ghostItems = computed(() => Array.from({ length: ghostCount.value }, (_, i) => i + 1))
const getLatestUpdatedRelativeTime = (site: Pick<Site, 'attributes' | 'updatedAt' | 'createdAt'>) => {
  const value = site.attributes?.latestUpdatedAt ?? site.updatedAt ?? site.createdAt
  return value ? (DateTime.fromISO(String(value)).toRelative() ?? '') : ''
}
const { filteredSites: filteredItems } = useSiteFilters()
const page = ref(1)
/** Same page size as the list view so switching views keeps the same sites on screen. */
const pagedItems = computed(() => {
  const start = (page.value - 1) * preferences.sitePageSize
  return filteredItems.value.slice(start, start + preferences.sitePageSize)
})
const itemCount = computed(() => pagedItems.value.length)
const { ghostCount } = useGhostItems({ tileWidth: 250, containerSelector: '.site-tiles', itemCount })
watch(
  () => [filteredItems.value.length, preferences.sitePageSize],
  () => {
    const pages = Math.max(1, Math.ceil(filteredItems.value.length / preferences.sitePageSize))
    if (page.value > pages) page.value = pages
  },
)
</script>

<template>
  <div class="site-tiles-with-footer">
    <div class="site-tiles">
      <SiteTileLoadingState v-if="siteStore.loadingSites" />
      <VCard
        v-for="site in pagedItems"
        v-else
        :key="site.id"
        class="site-tile-item"
        variant="flat"
        :ripple="false"
      >
        <div class="icon">
          <VImg
            v-if="site.attributes?.media?.icon?.dataUrl"
            :src="site.attributes.media.icon.dataUrl"
            contain
            height="90"
            width="230"
          />
          <div v-else class="d-flex align-center justify-center" style="height: 90px; width: 90px">
            <VIcon :icon="(site.icon && `fas ${site.icon}`) || 'fas fa-folder-open'" size="xxx-large" />
          </div>
        </div>
        <div class="title-wrapper">
          <div class="title">
            <ItemLink :to="{ name: 'site', params: { siteId: site.id } }" stretched>{{ site.name }}</ItemLink>
          </div>
        </div>
        <div v-if="(site.tags ?? []).length > 0" class="site-tile-tags">
          <TagOverflowRow
            :items="(site.tags ?? []).map(tag => ({ key: tag, text: tag, color: 'secondary' }))"
            size="x-small"
            :max-visible-chars="18"
          />
        </div>
        <div class="tile-footer">
          <div class="subtitle">{{ getLatestUpdatedRelativeTime(site) }}</div>
          <SiteInfoIcons :item="site" class="info-icons" />
        </div>
      </VCard>
      <template v-if="!siteStore.loadingSites"
        ><div v-for="n in ghostItems" :key="`ghost-${n}`" class="ghost"></div
      ></template>
      <LoadError
        v-if="siteStore.sitesError && !siteStore.loadingSites && filteredItems.length === 0"
        :message="siteStore.sitesError"
        @retry="siteStore.getSites().catch(() => undefined)"
      />
      <SiteEmptyState
        v-else-if="
          ['all', 'owned'].includes(siteStore.activeTab) &&
          !siteStore.loadingSites &&
          filteredItems.length === 0
        "
      />
      <FavouriteEmptyState
        v-else-if="
          siteStore.activeTab === 'favourites' && !siteStore.loadingSites && filteredItems.length === 0
        "
      />
    </div>
    <div class="site-tiles-footer">
      <TableFooter
        v-model:page="page"
        v-model:items-per-page="preferences.sitePageSize"
        :items="filteredItems"
        item-label="Sites"
      />
    </div>
  </div>
</template>

<style scoped>
.site-tiles-with-footer {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.site-tiles-footer {
  flex-shrink: 0;
}

.site-tile-item {
  position: relative;
}

.site-tile-tags {
  width: 100%;
  padding: 0 8px 32px;
  min-height: 24px;
  display: flex;
  justify-content: flex-start;
  box-sizing: border-box;
}

/* Above the tile-wide link (ItemLink stretched) so its buttons stay separately clickable. */
.tile-footer {
  position: absolute;
  z-index: 2;
  right: 10px;
  bottom: 10px;
  left: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tile-footer > .subtitle {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 12px 0 0;
}

.tile-footer > :deep(.info-icons) {
  width: auto;
  justify-content: flex-end;
  padding: 0;
  margin: 0;
  overflow: visible;
}

.tile-footer > :deep(.info-icon:last-child) {
  padding-right: 2px;
}

.site-tile-tags :deep(.tag-overflow-row) {
  justify-content: flex-start;
}
</style>
