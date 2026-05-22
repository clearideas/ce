<script setup lang="ts">
import { DateTime } from 'luxon'
import prettyBytes from 'pretty-bytes'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import ContentListLoadingState from '../base/ContentListLoadingState.vue'
import TableFooter from '../base/TableFooter.vue'
import ContentListItem from '../content/ContentListItem.vue'
import { useContainerWidth } from '../../composables'
import { useProfileStore, useSiteStore } from '../../stores'
import type { Site } from '../../types/domain'
import FavouriteEmptyState from './FavouritesEmptyState.vue'
import SiteEmptyState from './SiteEmptyState.vue'
import SiteInfoIcons from './SiteInfoIcons.vue'

const siteStore = useSiteStore()
const profileStore = useProfileStore()
const router = useRouter()
const { mobile } = useDisplay()
const page = ref(1)
const dataTableWrapperRef = ref<HTMLElement | null>(null)
const { isNarrow } = useContainerWidth(dataTableWrapperRef, { narrowBreakpoint: 768, mobileBreakpoint: 600 })
const selectedIds = defineModel<string[]>('selected', { default: [] })

const headers = computed(() => [
  { title: 'Name', key: 'name' },
  { title: 'Size', key: 'size', align: 'center' as const, mobileHide: true },
  { title: 'Last updated', key: 'updatedAt', align: 'center' as const, mobileHide: true },
])
const computedHeaders = computed(() => (isNarrow.value || mobile.value ? headers.value.filter(header => !header.mobileHide) : headers.value))
const filteredItems = computed(() => {
  if (siteStore.activeTab === 'favourites') {
    const favourites = profileStore.user?.attributes?.sites?.favourites ?? []
    return siteStore.sitesWithAttributes.filter(site => favourites.includes(site.id))
  }
  if (siteStore.activeTab === 'owned') return siteStore.sitesWithAttributes.filter(site => site.owned === true)
  return siteStore.sitesWithAttributes
})
const rowProps = (obj: { item: { id: string } }) => selectedIds.value.includes(obj.item.id) ? { class: 'data-table-item-selected' } : { class: 'data-table-item' }
function handleRowClick(_event: Event, row: { item: Site }) { void router.push({ name: 'site', params: { siteId: row.item.id } }) }
const getLatestUpdatedRelativeTime = (site: Site) => {
  const value = site.attributes?.latestUpdatedAt ?? site.updatedAt ?? site.createdAt
  return value ? DateTime.fromISO(String(value)).toRelative() ?? '' : ''
}
function getSiteSize(site: Site) {
  return site.attributes?.totalActiveSize ??
    (site.files ?? []).reduce((sum, file) => sum + (file.size ?? 0), 0) +
      (site.folders ?? []).reduce((sum, folder) => sum + folder.files.reduce((n, file) => n + (file.size ?? 0), 0), 0)
}
</script>

<template>
  <div class="list-with-footer">
    <div ref="dataTableWrapperRef" class="list-scroll">
      <div class="data-table-wrapper site-list-container">
        <VDataTable
          v-model:page="page"
          v-model:items-per-page="profileStore.sitePageSize"
          hide-default-footer
          :items="filteredItems"
          :headers="computedHeaders"
          :sort-by="[{ key: 'name', order: 'asc' }]"
          :loading="siteStore.loadingSites"
          :class="filteredItems.length === 0 && !siteStore.loadingSites ? 'no-data' : ''"
          :row-props="rowProps"
          @click:row="handleRowClick"
          return-object
          class="h-100"
        >
          <template #item.name="{ item }">
            <ContentListItem :text="item.name" prepend-width="32px">
              <template #prepend>
                <div class="flex-grow-0 flex-shrink-0 d-flex align-center justify-center">
                  <VImg v-if="item.attributes?.media?.icon?.dataUrl" :src="item.attributes.media.icon.dataUrl" contain height="32" width="32" class="flex-shrink-0 flex-grow-0" />
                  <VIcon v-else class="flex-shrink-0 flex-grow-0" :icon="(item.icon && `fasl ${item.icon}`) || 'fasl fa-folder-open'" />
                </div>
              </template>
              <template #text>{{ item.name }}</template>
              <template #subtitle v-if="isNarrow || mobile">
                {{ getLatestUpdatedRelativeTime(item) }}
                {{ getSiteSize(item) > 0 ? `(${prettyBytes(getSiteSize(item))})` : '' }}
              </template>
              <template #append><SiteInfoIcons :item="item" class="flex-grow-0 flex-shrink-0" /></template>
            </ContentListItem>
          </template>
          <template #item.size="{ item }"><div class="site-list-cell site-list-cell--center">{{ getSiteSize(item) > 0 ? prettyBytes(getSiteSize(item)) : '' }}</div></template>
          <template #item.updatedAt="{ item }"><div class="site-list-cell site-list-cell--center">{{ getLatestUpdatedRelativeTime(item) }}</div></template>
          <template #loading><ContentListLoadingState :rows="10" variant="site" :show-checkbox="false" /></template>
          <template #bottom />
          <template #no-data>
            <SiteEmptyState v-if="['all', 'owned'].includes(siteStore.activeTab) && !siteStore.loadingSites && filteredItems.length === 0" />
            <FavouriteEmptyState v-if="siteStore.activeTab === 'favourites' && !siteStore.loadingSites && filteredItems.length === 0" />
          </template>
        </VDataTable>
      </div>
    </div>
    <div class="list-footer">
      <TableFooter v-model:page="page" v-model:items-per-page="profileStore.sitePageSize" :items="filteredItems" item-label="Sites" />
    </div>
  </div>
</template>

<style scoped>
.list-with-footer { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.list-scroll { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
.list-scroll .data-table-wrapper { flex: 1; min-height: 0; margin-bottom: 0; }
.data-table-wrapper :deep(.v-data-table-progress) { display: none; }
.data-table-wrapper :deep(.v-data-table-rows-loading),
.data-table-wrapper :deep(.v-data-table-rows-loading td),
.data-table-wrapper :deep(.v-data-table-rows-loading .v-data-table__td) { vertical-align: middle !important; }
.data-table-wrapper :deep(.v-data-table-rows-loading > td),
.data-table-wrapper :deep(.v-data-table-rows-loading .v-data-table__td) { padding: 0 !important; }
.data-table-wrapper :deep(.v-data-table-rows-loading .content-list-loading-state) { margin: 0 !important; }
.list-footer { flex-shrink: 0; }
.site-list-cell { width: 100%; }
.site-list-cell--center { text-align: center; }
</style>
