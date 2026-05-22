<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { useContentStore, useSiteStore } from '../../stores'
import { fileIcon, formatBytes } from '../../utils/format'

const contentStore = useContentStore()
const siteStore = useSiteStore()
const router = useRouter()
const { smAndDown } = useDisplay()
const drawerWidth = ref(400)
const isResizing = ref(false)
const minWidth = ref(400)
const maxWidth = ref(window.innerWidth - 600)

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

function openResult(item: { id?: string; kind?: string; site?: string; siteId?: string; folderId?: string }) {
  const siteId = item.siteId ?? item.site ?? siteStore.currentSiteId
  if (!siteId) return
  if (item.kind === 'folder' && item.id) {
    void router.push({ name: 'site-folder-tab', params: { siteId, folderId: item.id, siteTab: 'content' } })
  } else if (item.id) {
    void router.push({ name: 'file', params: { siteId, fileId: item.id } })
  } else if (item.folderId) {
    void router.push({ name: 'site-folder-tab', params: { siteId, folderId: item.folderId, siteTab: 'content' } })
  } else {
    void router.push({ name: 'site', params: { siteId } })
  }
  contentStore.showSearchResults = false
}

function startResizing() {
  isResizing.value = true

  const handleMouseMove = (moveEvent: MouseEvent) => {
    if (isResizing.value) {
      const newWidth = moveEvent.clientX
      if (newWidth >= minWidth.value && newWidth <= maxWidth.value) drawerWidth.value = newWidth
    }
  }

  const stopResizing = () => {
    isResizing.value = false
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', stopResizing)
  }

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', stopResizing)
}

onBeforeUnmount(() => {
  isResizing.value = false
})
</script>

<template>
  <VNavigationDrawer v-model="isOpen" location="left" elevation="2" mobile-breakpoint="md" :width="drawerWidth" class="search-results-drawer" disable-resize-watcher>
    <div class="chat-content">
      <div class="content-header search-results-header">
        <div class="search-results-summary">
          <div class="search-results-summary__title">{{ contentStore.searchQuery || 'Search results' }}</div>
          <div class="search-results-summary__context">
            <VProgressCircular v-if="contentStore.isSearching" size="16" width="2" color="feature" indeterminate />
            <span>{{ searchSummary }}</span>
          </div>
        </div>
        <div class="actions">
          <VBtn icon="fasl fa-xmark" variant="text" density="comfortable" color="secondary" aria-label="Close search results" @click="contentStore.showSearchResults = false" />
        </div>
      </div>
      <div class="search-results">
        <VListItem v-for="(item, index) in results" :key="item.id" class="w-100 flex-grow-0 flex-shrink-0 search-results-item" nav @click="openResult(item)">
          <template #prepend>
            <div class="d-flex align-center justify-center mr-2" style="height: 40px; width: 40px">
              <VIcon :icon="fileIcon(item.contentType)" size="small" />
            </div>
          </template>
          <VListItemTitle class="ellipsis fs-14 search-results-item__title">{{ index + 1 }}. {{ item.name }}</VListItemTitle>
          <VListItemSubtitle class="fs-12 search-results-item__subtitle">
            {{ item.folderName ?? 'Folder' }} · {{ formatBytes(item.size) }}
          </VListItemSubtitle>
        </VListItem>
        <div v-if="!contentStore.isSearching && results.length === 0" class="pa-6 text-medium-emphasis">
          Search by file name or metadata to find content in {{ contentStore.searchScope?.label ?? 'all sites' }}.
        </div>
      </div>
    </div>
    <template #append>
      <div
        v-if="smAndDown ? false : contentStore.showSearchResults"
        v-tippy="{ content: 'Resize results', placement: 'bottom' }"
        class="resize-handle left"
        @mousedown="startResizing"
      >
        <div class="handle-lines" />
        <div class="handle-lines" />
      </div>
    </template>
  </VNavigationDrawer>
</template>

<style lang="scss">
.v-navigation-drawer.search-results-drawer {
  overflow: visible !important;
  background: var(--ci-surface) !important;
  color: var(--ci-on-surface) !important;
  border-inline-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  box-shadow:
    -8px 0 28px rgba(15, 23, 42, 0.07),
    0 0 0 1px rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.4)) !important;
}

.v-navigation-drawer.search-results-drawer .v-navigation-drawer__content,
.v-navigation-drawer.search-results-drawer .v-navigation-drawer__append {
  overflow: visible !important;
  background: var(--ci-surface) !important;
}
</style>

<style lang="scss" scoped>
.search-results-header {
  align-items: flex-start !important;
  min-height: 56px !important;
  height: auto !important;
  padding: 8px 8px 8px 0 !important;
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
  font-weight: 600;
  letter-spacing: -0.01em;
}

.search-results-item__subtitle {
  color: rgba(var(--v-theme-on-surface), 0.74);
  font-weight: 400;
}

@media (max-width: 959px) {
  .search-results-header {
    padding-right: 0 !important;
  }

  .search-results-summary__title {
    font-size: 15px;
  }
}
</style>
