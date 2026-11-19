<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseTabs from '../components/base/BaseTabs.vue'
import SiteActions from '../components/sites/actions/SiteActions.vue'
import SiteList from '../components/sites/SiteList.vue'
import SiteTiles from '../components/sites/SiteTiles.vue'
import { useSiteStore } from '../stores'
import PageHeader from '../components/base/PageHeader.vue'
import { usePreferences } from '../composables/usePreferences'

const siteStore = useSiteStore()
const { preferences } = usePreferences()
const route = useRoute()
const router = useRouter()

const tabs = computed(() => [
  { title: 'All', key: 'all', to: { name: 'sites-tab', params: { sitesTab: 'all' } } },
  { title: 'Favourites', key: 'favourites', to: { name: 'sites-tab', params: { sitesTab: 'favourites' } } },
  { title: 'Owned', key: 'owned', to: { name: 'sites-tab', params: { sitesTab: 'owned' } } },
])

onMounted(async () => {
  // A failure is shown by the list (siteStore.sitesError), not thrown into the console.
  await siteStore.getSitesIfRequired().catch(() => undefined)
})

watch(
  () => route.fullPath,
  async () => {
    await siteStore.setCurrentSite(undefined).catch(() => undefined)
  },
  { immediate: true },
)

watch(
  () => route.params.sitesTab,
  sitesTab => {
    const nextTab = Array.isArray(sitesTab) ? sitesTab[0] : sitesTab
    siteStore.activeTab = nextTab === 'owned' || nextTab === 'favourites' ? nextTab : 'all'
  },
  { immediate: true },
)

watch(
  () => siteStore.activeTab,
  nextTab => {
    const currentTab = Array.isArray(route.params.sitesTab) ? route.params.sitesTab[0] : route.params.sitesTab
    if ((currentTab ?? 'all') !== nextTab)
      void router.replace({ name: 'sites-tab', params: { sitesTab: nextTab } })
  },
)
</script>

<template>
  <div
    class="sites-view"
    :class="{ 'table-active': !preferences.tileView, 'tiles-active': preferences.tileView }"
  >
    <PageHeader title="Sites" />
    <div class="content-header sites-header">
      <BaseTabs v-model="siteStore.activeTab" :tabs="tabs" />
      <SiteActions class="actions" />
    </div>
    <div class="content-header-gap sites-header-gap"></div>
    <div class="sites-body">
      <div v-if="!preferences.tileView" class="sites-pane">
        <SiteList />
      </div>
      <div v-else class="sites-tiles-shell page-bleed">
        <SiteTiles />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sites-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.sites-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.sites-header {
  padding-right: 0;
}

.sites-header-gap {
  --content-header-body-gap: 10px;
}

.sites-view.table-active .sites-body {
  overflow: hidden;
}

.sites-view.tiles-active,
.sites-view.tiles-active .sites-body,
.sites-view.tiles-active .sites-pane,
.sites-view.tiles-active .sites-tiles-shell {
  overflow: visible;
}

.sites-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.sites-tiles-shell {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.sites-view.tiles-active :deep(.site-tiles),
.sites-view.tiles-active :deep(.content-tiles) {
  margin-left: 0;
  margin-right: 0;
}
</style>
