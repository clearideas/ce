<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore, useContentStore, useProfileStore, useSiteStore } from '../stores'
import type { NavKey, Session } from '../types/domain'
import Footer from './components/Footer.vue'
import Navbar from './components/Navbar.vue'
import UnsavedChangesDialog from '../components/base/UnsavedChangesDialog.vue'
import SearchResults from './components/SearchResults.vue'
import VerticalNav from './components/VerticalNav.vue'
import { usePreferences } from '../composables/usePreferences'

const props = defineProps<{ session: Session }>()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { preferences } = usePreferences()
const profileStore = useProfileStore()
const siteStore = useSiteStore()
const contentStore = useContentStore()
const isDrawerOpen = ref(false)
const isVerticalMenuMini = computed({
  get: () => preferences.navRail,
  set: value => {
    preferences.navRail = value
  },
})

const active = computed<NavKey>(() => {
  if (route.path.startsWith('/ask')) return 'ask'
  if (route.path.startsWith('/users')) return 'users'
  if (route.path.startsWith('/agents')) return 'agents'
  if (route.path.startsWith('/analytics')) return 'analytics'
  if (route.path.startsWith('/settings')) return 'settings'
  return 'sites'
})
const isSiteRoute = computed(() => ['site', 'site-tab', 'site-folder-tab'].includes(String(route.name ?? '')))

async function logout() {
  await authStore.logout()
  await router.push('/login')
}

onMounted(async () => {
  await Promise.allSettled([profileStore.getProfile(), siteStore.getSitesIfRequired()])
})
</script>

<template>
  <Navbar
    v-model:is-drawer-open="isDrawerOpen"
    v-model:is-vertical-menu-mini="isVerticalMenuMini"
    :session="props.session"
    class="d-print-none"
    @logout="logout"
  />
  <VMain>
    <VerticalNav
      v-model:is-drawer-open="isDrawerOpen"
      v-model:is-vertical-menu-mini="isVerticalMenuMini"
      class="d-print-none"
    />
    <SearchResults />
    <UnsavedChangesDialog />
    <div
      class="content"
      :class="{
        'settings-page': active === 'settings',
        'analytics-page': active === 'analytics',
        'search-results-open': contentStore.showSearchResults,
        'site-settings-page': isSiteRoute && contentStore.activeTab === 'settings',
        'sites-tiles-page': route.name === 'sites' && preferences.tileView,
        'site-tiles-page': isSiteRoute && contentStore.activeTab === 'content' && preferences.tileView,
      }"
    >
      <div class="content-flow">
        <RouterView />
      </div>
      <div class="content-footer-shell">
        <Footer />
      </div>
    </div>
  </VMain>
</template>
