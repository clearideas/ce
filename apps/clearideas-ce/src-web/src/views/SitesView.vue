<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseTabs from '../components/base/BaseTabs.vue'
import ContentList from '../components/content/ContentList.vue'
import ContentTiles from '../components/content/ContentTiles.vue'
import SiteActions from '../components/sites/actions/SiteActions.vue'
import SiteList from '../components/sites/SiteList.vue'
import SiteTiles from '../components/sites/SiteTiles.vue'
import { useProfileStore, useSiteStore } from '../stores'

const siteStore = useSiteStore()
const profileStore = useProfileStore()
const route = useRoute()
const router = useRouter()
const contentHeaderRef = ref<HTMLElement | null>(null)

const tabs = computed(() => [
  { title: 'All', key: 'all', to: { name: 'sites-tab', params: { sitesTab: 'all' } } },
  { title: 'Favourites', key: 'favourites', to: { name: 'sites-tab', params: { sitesTab: 'favourites' } } },
  { title: 'Owned', key: 'owned', to: { name: 'sites-tab', params: { sitesTab: 'owned' } } },
])

function dismissHero() {}

onMounted(async () => {
  await siteStore.getSitesIfRequired()
})

watch(
  () => route.fullPath,
  async () => {
    await siteStore.setCurrentSite(undefined)
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
    dismissHero()
    const currentTab = Array.isArray(route.params.sitesTab) ? route.params.sitesTab[0] : route.params.sitesTab
    if ((currentTab ?? 'all') !== nextTab) void router.replace({ name: 'sites-tab', params: { sitesTab: nextTab } })
  },
)

watch(
  () => profileStore.tileView,
  () => dismissHero(),
)
</script>

<template>
  <div
    class="sites-view"
    :class="{ 'table-active': !profileStore.tileView, 'tiles-active': profileStore.tileView }"
  >
    <div class="content-header sites-header" ref="contentHeaderRef">
      <BaseTabs v-model="siteStore.activeTab" :tabs="tabs" />
      <SiteActions class="actions" @interact="dismissHero" />
    </div>
    <div class="content-header-gap sites-header-gap"></div>
    <div class="sites-body">
      <div v-if="siteStore.activeTab !== 'bookmarks' && !profileStore.tileView" class="sites-pane">
        <SiteList />
      </div>
      <div
        v-if="siteStore.activeTab !== 'bookmarks' && profileStore.tileView"
        class="sites-tiles-shell"
      >
        <SiteTiles />
      </div>
      <div v-if="siteStore.activeTab === 'bookmarks' && !profileStore.tileView" class="sites-pane">
        <ContentList display="bookmarks" />
      </div>
      <div
        v-if="siteStore.activeTab === 'bookmarks' && profileStore.tileView"
        class="sites-tiles-shell"
      >
        <ContentTiles display="bookmarks" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sites-view { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.sites-body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.sites-header { padding-right: 0; }
.sites-header-gap { --content-header-body-gap: 10px; }
.sites-view.table-active .sites-body { overflow: hidden; }
.sites-view.tiles-active,
.sites-view.tiles-active .sites-body,
.sites-view.tiles-active .sites-pane,
.sites-view.tiles-active .sites-tiles-shell { overflow: visible; }
.sites-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.sites-tiles-shell { display: flex; flex-direction: column; flex: 1; min-height: 0; width: calc(100% + 16px); margin-left: -8px; margin-right: -8px; padding-left: 8px; padding-right: 8px; box-sizing: border-box; }
.sites-view.tiles-active :deep(.site-tiles),
.sites-view.tiles-active :deep(.content-tiles) { margin-left: 0; margin-right: 0; }
</style>
