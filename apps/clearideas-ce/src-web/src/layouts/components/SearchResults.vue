<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useDisplay } from 'vuetify'
import { usePreferences } from '../../composables/usePreferences'
import { useContentStore, useSiteStore } from '../../stores'
import { fileIcon, formatBytes } from '../../utils/format'

const contentStore = useContentStore()
const siteStore = useSiteStore()
const { smAndDown } = useDisplay()
const MIN_WIDTH = 320
const KEYBOARD_STEP = 32
const { preferences } = usePreferences()
const drawerWidth = computed({
  get: () => preferences.searchResultsWidth,
  set: value => {
    preferences.searchResultsWidth = value
  },
})
const isResizing = ref(false)
const maxWidth = ref(computeMaxWidth())

function computeMaxWidth() {
  return Math.max(MIN_WIDTH, window.innerWidth - 600)
}

function setWidth(next: number) {
  drawerWidth.value = Math.min(maxWidth.value, Math.max(MIN_WIDTH, Math.round(next)))
}

function handleWindowResize() {
  maxWidth.value = computeMaxWidth()
  setWidth(drawerWidth.value)
}

function handleResizeKeydown(event: KeyboardEvent) {
  const delta =
    event.key === 'ArrowRight'
      ? KEYBOARD_STEP
      : event.key === 'ArrowLeft'
        ? -KEYBOARD_STEP
        : event.key === 'Home'
          ? -Infinity
          : event.key === 'End'
            ? Infinity
            : 0
  if (delta === 0) return
  event.preventDefault()
  setWidth(drawerWidth.value + delta)
}

const isOpen = computed({
  get: () => contentStore.showSearchResults,
  set: value => (contentStore.showSearchResults = value),
})

const results = computed(() => contentStore.searchResults)
const searchSummary = computed(() => {
  const count = results.value.length
  const resultLabel = count === 1 ? 'result' : 'results'
  const scope = contentStore.searchScope?.label ?? siteStore.currentSite?.name ?? 'all sites'
  return `${count} ${resultLabel} in ${scope}`
})

type SearchResultTarget = { id?: string; kind?: string; site?: string; siteId?: string; folderId?: string }

/** Where a result leads (results are links: keyboard, screen readers, open in a new tab). */
function resultLocation(item: SearchResultTarget): RouteLocationRaw | undefined {
  const siteId = item.siteId ?? item.site ?? siteStore.currentSiteId
  if (!siteId) return undefined
  if (item.kind === 'folder' && item.id)
    return { name: 'site-folder-tab', params: { siteId, folderId: item.id, siteTab: 'content' } }
  if (item.id) return { name: 'file', params: { siteId, fileId: item.id } }
  if (item.folderId)
    return { name: 'site-folder-tab', params: { siteId, folderId: item.folderId, siteTab: 'content' } }
  return { name: 'site', params: { siteId } }
}

/** Escape closes the results and puts focus back in the search box. */
function closeFromKeyboard() {
  contentStore.showSearchResults = false
  document.querySelector<HTMLElement>('[role="search"] [role="textbox"]')?.focus()
}

function startResizing() {
  isResizing.value = true

  const handleMouseMove = (moveEvent: MouseEvent) => {
    if (isResizing.value) setWidth(moveEvent.clientX)
  }

  const stopResizing = () => {
    isResizing.value = false
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', stopResizing)
  }

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', stopResizing)
}

onMounted(() => window.addEventListener('resize', handleWindowResize))
onBeforeUnmount(() => {
  isResizing.value = false
  window.removeEventListener('resize', handleWindowResize)
})
</script>

<template>
  <VNavigationDrawer
    v-model="isOpen"
    location="left"
    elevation="2"
    mobile-breakpoint="md"
    :width="drawerWidth"
    class="search-results-drawer"
    tag="aside"
    aria-label="Search results"
    disable-resize-watcher
    @keydown.esc="closeFromKeyboard"
  >
    <div class="chat-content">
      <div class="content-header search-results-header">
        <div class="search-results-summary">
          <div class="search-results-summary__title">{{ contentStore.searchQuery || 'Search results' }}</div>
          <div class="search-results-summary__context" aria-live="polite">
            <VProgressCircular
              v-if="contentStore.isSearching"
              size="16"
              width="2"
              color="feature"
              indeterminate
              aria-label="Searching"
            />
            <span>{{ contentStore.isSearching ? 'Searching…' : searchSummary }}</span>
          </div>
        </div>
        <div class="actions">
          <VBtn
            icon="fas fa-xmark"
            variant="text"
            density="comfortable"
            color="secondary"
            aria-label="Close search results"
            @click="contentStore.showSearchResults = false"
          />
        </div>
      </div>
      <div class="search-results">
        <template v-if="contentStore.isSearching && results.length === 0">
          <VSkeletonLoader
            v-for="n in 6"
            :key="`skeleton-${n}`"
            type="list-item-two-line"
            class="search-results-skeleton"
          />
        </template>
        <VListItem
          v-for="(item, index) in results"
          :key="item.id"
          class="w-100 flex-grow-0 flex-shrink-0 search-results-item"
          nav
          :to="resultLocation(item)"
          @click="contentStore.showSearchResults = false"
        >
          <template #prepend>
            <div class="d-flex align-center justify-center mr-2" style="height: 40px; width: 40px">
              <VIcon :icon="fileIcon(item.contentType)" size="small" />
            </div>
          </template>
          <VListItemTitle class="text-truncate search-results-item__title"
            >{{ index + 1 }}. {{ item.name }}</VListItemTitle
          >
          <VListItemSubtitle class="search-results-item__subtitle">
            {{ item.folderName ?? 'Folder' }} · {{ formatBytes(item.size) }}
          </VListItemSubtitle>
        </VListItem>
        <div v-if="!contentStore.isSearching && results.length === 0" class="pa-6 text-medium-emphasis">
          <template v-if="contentStore.searchedQuery">
            No results for “{{ contentStore.searchedQuery }}”. Try other words, or search by metadata (for
            example <code>@contentType:application/pdf</code>).
          </template>
          <template v-else>
            Search by file name or metadata to find content in
            {{ contentStore.searchScope?.label ?? 'all sites' }}.
          </template>
        </div>
      </div>
    </div>
    <template #append>
      <div
        v-if="smAndDown ? false : contentStore.showSearchResults"
        v-tippy="{ content: 'Resize results (arrow keys)', placement: 'bottom' }"
        class="resize-handle left"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize search results"
        :aria-valuenow="drawerWidth"
        :aria-valuemin="MIN_WIDTH"
        :aria-valuemax="maxWidth"
        tabindex="0"
        @mousedown="startResizing"
        @keydown="handleResizeKeydown"
      >
        <div class="handle-lines" />
        <div class="handle-lines" />
      </div>
    </template>
  </VNavigationDrawer>
</template>

<style lang="scss">
/*
 * Closed, the drawer is translated by its own width from the main navigation's edge, so part of it
 * sat behind the (translucent) main navigation and showed through. Hide it once the slide-out
 * finishes; it becomes visible immediately when opened.
 */
.search-results-drawer:not(.v-navigation-drawer--active) {
  visibility: hidden;
  transition:
    transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    visibility 0s linear 0.2s;
}

.v-navigation-drawer.search-results-drawer {
  overflow: visible;
  background: var(--ci-surface);
  color: var(--ci-on-surface);
  border-inline-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  box-shadow:
    var(--ci-shadow-side),
    0 0 0 1px rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.4));
}

.v-navigation-drawer.search-results-drawer .v-navigation-drawer__content,
.v-navigation-drawer.search-results-drawer .v-navigation-drawer__append {
  overflow: visible;
  background: var(--ci-surface);
}
</style>

<style lang="scss" scoped>
.search-results-header {
  align-items: flex-start;
  min-height: 56px;
  height: auto;
  padding: 8px 8px 8px 0;
}

.search-results-summary {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 3px;
  min-width: 0;
  padding: 0;
  line-height: 1.2;
  justify-content: center;
  min-height: 56px;
}

.search-results-summary__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.search-results-summary__context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 12px;
}

.search-results {
  margin-top: 6px;
}

.search-results-header :deep(.actions) {
  align-self: flex-start;
  margin-right: -4px;
}

.search-results-item {
  border-radius: 6px;
  padding-top: 6px;
  padding-bottom: 6px;
}

.search-results-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.search-results-item__title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.search-results-item__subtitle {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.74);
  font-weight: 400;
  /* The colour already carries the emphasis; VListItemSubtitle's own opacity would halve it (3.2:1). */
  opacity: 1;
}

@media (max-width: 959px) {
  .search-results-header {
    padding-right: 0;
  }

  .search-results-summary__title {
    font-size: 15px;
  }
}
</style>
