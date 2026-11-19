<script setup lang="ts">
import { siteContentPermissions } from '../../config/roles'
import { computed, ref, watch } from 'vue'
import { DateTime } from 'luxon'
import type { RouteLocationRaw } from 'vue-router'
import IconCheckbox from '../base/IconCheckbox.vue'
import ItemLink from '../base/ItemLink.vue'
import TagOverflowRow from '../base/TagOverflowRow.vue'
import ContentEmptyState from './ContentEmptyState.vue'
import ContentInfoIcons from './ContentInfoIcons.vue'
import ContentTileLoadingState from './ContentTileLoadingState.vue'
import TableFooter from '../base/TableFooter.vue'
import { useGhostItems } from '../../composables/useGhostItems'
import { filterAndSortContent, useContentFilters } from '../../composables/useContentFilters'
import { usePreferences } from '../../composables/usePreferences'
import { useContentStore, useSiteStore } from '../../stores'

import type { ContentItem } from '../../types/domain'

interface Props {
  siteId?: string
  id?: string
}
const props = defineProps<Props>()
const selectedIds = defineModel<string[]>('selected', { default: () => [] })
const { state: filters, hasActiveFilters } = useContentFilters()
const { preferences } = usePreferences()
const contentStore = useContentStore()
const page = ref(1)
const siteStore = useSiteStore()
const loading = computed(() => !!(siteStore.loadingSites || contentStore.loading))
const canEditContent = computed(() => siteContentPermissions(siteStore.currentSite?.currentUserRole).canEdit)
const contents = computed<ContentItem[]>(() =>
  [...contentStore.contents].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
)
const sortedAndFilteredContents = computed<ContentItem[]>(() => filterAndSortContent(contents.value, filters))
/** Same page size as the list view so switching views keeps the same items on screen. */
const pagedContents = computed(() => {
  const start = (page.value - 1) * preferences.sitePageSize
  return sortedAndFilteredContents.value.slice(start, start + preferences.sitePageSize)
})
const pagedCount = computed(() => pagedContents.value.length)
const { ghostCount } = useGhostItems({
  tileWidth: 190,
  containerSelector: '.content-tiles',
  itemCount: pagedCount,
})
const ghostItems = computed(() => Array.from({ length: ghostCount.value }, (_, i) => i + 1))
function itemLocation(content: ContentItem): RouteLocationRaw {
  const siteId = props.siteId ?? content.site
  return content.kind === 'file'
    ? { name: 'file', params: { siteId, fileId: content.id } }
    : { name: 'site-folder-tab', params: { siteId, folderId: content.id, siteTab: 'content' } }
}
function syncFolder() {
  if (!props.siteId) return
  contentStore.activeFolderId = props.id
}
watch(() => [props.siteId, props.id], syncFolder, { immediate: true })
watch(
  canEditContent,
  canEdit => {
    if (!canEdit) selectedIds.value = []
  },
  { immediate: true },
)
watch(
  () => ({ ...filters, pageSize: preferences.sitePageSize, total: sortedAndFilteredContents.value.length }),
  () => {
    const pages = Math.max(1, Math.ceil(sortedAndFilteredContents.value.length / preferences.sitePageSize))
    if (page.value > pages) page.value = pages
  },
  { deep: true },
)
</script>

<template>
  <div class="content-tiles-with-footer">
    <div class="content-tiles">
      <ContentTileLoadingState v-if="loading" :show-checkbox="canEditContent" />
      <VCard
        v-for="content in pagedContents"
        v-else
        :key="content.id"
        class="content-tile-item"
        variant="flat"
        :ripple="false"
      >
        <div v-if="canEditContent" class="tile-selection" @click.stop>
          <IconCheckbox
            :id="content.id"
            v-model="selectedIds"
            :size="16"
            :aria-label="`Select ${content.name}`"
          />
        </div>
        <div class="icon-wrapper">
          <div class="numbering" />
          <div class="icon">
            <VImg
              v-if="content.attributes?.thumbnail"
              :src="`data:image/png;base64,${content.attributes.thumbnail}`"
              contain
              height="90"
              width="90"
            />
            <div v-else class="d-flex align-center justify-center" style="height: 90px; width: 90px">
              <VIcon :icon="`fas ${content.attributes.icon}`" size="xxx-large" />
            </div>
          </div>
          <div class="invisible" />
        </div>
        <div class="title-wrapper">
          <div class="title">
            <ItemLink :to="itemLocation(content)" stretched>{{ content.name }}</ItemLink>
          </div>
        </div>
        <div v-if="(content.tags ?? []).length > 0" class="content-tile-tags">
          <TagOverflowRow
            :items="(content.tags ?? []).map((tag: string) => ({ key: tag, text: tag, color: 'secondary' }))"
            size="x-small"
            :max-visible-chars="18"
          />
        </div>
        <div class="tile-footer">
          <div class="subtitle">
            {{ content.updatedAt && DateTime.fromISO(content.updatedAt.toString()).toRelative() }}
          </div>
          <ContentInfoIcons :item="content" menu-only />
        </div>
      </VCard>
      <template v-if="!loading">
        <div v-for="n in ghostItems" :key="`ghost-${n}`" class="ghost" />
      </template>
      <div
        v-if="hasActiveFilters && (contents.length ?? 0) > 0 && (sortedAndFilteredContents.length ?? 0) === 0"
        class="text-medium-emphasis pa-4"
      >
        No matching content.
      </div>
      <ContentEmptyState
        v-if="!loading && (contents.length ?? 0) === 0"
        :id="props.id"
        :site-id="props.siteId!"
        :loading="loading"
      />
    </div>
    <div class="content-tiles-footer">
      <TableFooter
        v-model:page="page"
        v-model:items-per-page="preferences.sitePageSize"
        :items="sortedAndFilteredContents"
        item-label="Items"
      />
    </div>
  </div>
</template>

<style scoped>
.content-tiles-with-footer {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.content-tiles-footer {
  flex-shrink: 0;
}

.content-tile-item {
  position: relative;
}

.content-tile-tags {
  width: 100%;
  padding: 0 8px 32px;
  min-height: 24px;
  display: flex;
  justify-content: flex-start;
  box-sizing: border-box;
}

/* Selection and footer controls sit above the tile-wide link (ItemLink stretched). */
.tile-selection {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
}

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

.content-tile-tags :deep(.tag-overflow-row) {
  justify-content: flex-start;
}
</style>
