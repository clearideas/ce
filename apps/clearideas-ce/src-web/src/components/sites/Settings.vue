<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { isNavigationFailure, NavigationFailureType, useRoute, useRouter } from 'vue-router'
import SideNavLayout, { type SideNavItem } from '../base/SideNavLayout.vue'
import { useUnsavedChangesGuard } from '../../composables/useUnsavedChangesGuard'
import AI from './settings/AI.vue'
import CustomBranding from './settings/CustomBranding.vue'
import General from './settings/General.vue'
import Notifications from './settings/Notifications.vue'
import PDFOptions from './settings/PDFOptions.vue'
import SiteIcon from './settings/SiteIcon.vue'

interface Props {
  siteId?: string
  requestedTab?: string | null
}
const props = defineProps<Props>()

const SITE_SETTINGS_TAB_SLUGS: Record<string, string> = {
  icons: 'branding',
}

const SITE_SETTINGS_SLUG_TABS = Object.fromEntries(
  Object.entries(SITE_SETTINGS_TAB_SLUGS).map(([tabName, slug]) => [slug, tabName]),
)

const route = useRoute()
const router = useRouter()
const tab = ref('general')
const visibleSiteSettingsMenuItems = computed<SideNavItem[]>(() => [
  { label: 'General', key: 'general', icon: 'fas fa-gear' },
  { label: 'Icons and branding', key: 'icons', icon: 'fas fa-icons' },
  { label: 'Notifications', key: 'notifications', icon: 'fas fa-bell' },
  { label: 'PDF options', key: 'pdf-options', icon: 'fas fa-file-pdf' },
  { label: 'AI', key: 'ai', icon: 'fas fa-robot' },
])
const visibleTabKeys = computed(() =>
  visibleSiteSettingsMenuItems.value.flatMap(item => ('key' in item ? [item.key] : [])),
)
const normalizedRequestedTab = computed(() => {
  if (!props.requestedTab) return null
  return SITE_SETTINGS_SLUG_TABS[props.requestedTab] ?? props.requestedTab
})

function getSettingsTabSlug(tabName: string) {
  return SITE_SETTINGS_TAB_SLUGS[tabName] ?? tabName
}

watch(
  [normalizedRequestedTab, visibleTabKeys],
  ([requestedTab, tabKeys]) => {
    if (tabKeys.length === 0) return
    if (requestedTab && tabKeys.includes(requestedTab)) {
      tab.value = requestedTab
      return
    }
    if (!tabKeys.includes(tab.value)) tab.value = tabKeys[0] ?? 'general'
  },
  { immediate: true },
)

const currentSiteId = computed(
  () => props.siteId ?? (Array.isArray(route.params.siteId) ? route.params.siteId[0] : route.params.siteId),
)

/** The URL of a settings section (same site, folder and query as now). */
function sectionLocation(nextTab: string, siteId: string) {
  return {
    name: route.params.folderId ? 'site-folder-tab' : 'site-tab',
    params: {
      siteId,
      ...(route.params.folderId ? { folderId: route.params.folderId } : {}),
      siteTab: 'settings',
      siteSettingsTab: getSettingsTabSlug(nextTab),
    },
    query: route.query,
  }
}

/** Section links, so they are announced as links and can be opened in a new tab. */
const navItems = computed<SideNavItem[]>(() =>
  visibleSiteSettingsMenuItems.value.map(item =>
    'key' in item && currentSiteId.value
      ? { ...item, href: router.resolve(sectionLocation(item.key, currentSiteId.value)).href }
      : item,
  ),
)

/** Keep the URL in step with the visible section; returns the navigation result. */
function syncRoute(nextTab: string) {
  const siteId = currentSiteId.value
  if (!siteId) return Promise.resolve(undefined)

  const nextSettingsTab = getSettingsTabSlug(nextTab)
  const currentSettingsTab = Array.isArray(route.params.siteSettingsTab)
    ? route.params.siteSettingsTab[0]
    : route.params.siteSettingsTab
  if (currentSettingsTab === nextSettingsTab) return Promise.resolve(undefined)

  return router.replace(sectionLocation(nextTab, siteId))
}

watch(tab, nextTab => void syncRoute(nextTab))

/** Menu selection navigates first, so the unsaved-changes guard can keep the current form open. */
async function selectTab(nextTab: string) {
  if (nextTab === tab.value) return
  const failure = await syncRoute(nextTab)
  if (isNavigationFailure(failure, NavigationFailureType.aborted)) return
  tab.value = nextTab
}

// The forms report unsaved edits; leaving the section, the settings tab or the site asks first.
const forms = ref<Array<{ dirty: boolean } | null>>([])
useUnsavedChangesGuard(() => forms.value.some(form => form?.dirty === true))
</script>

<template>
  <div class="site-settings">
    <SideNavLayout
      :items="navItems"
      :model-value="tab"
      label="Site settings sections"
      @update:model-value="selectTab"
    >
      <div class="site-settings-content-wrap d-flex flex-column ga-4">
        <General v-if="tab === 'general'" :ref="el => (forms[0] = el as { dirty: boolean } | null)" />
        <SiteIcon v-if="tab === 'icons'" />
        <CustomBranding v-if="tab === 'icons'" />
        <Notifications
          v-if="tab === 'notifications'"
          :ref="el => (forms[1] = el as { dirty: boolean } | null)"
        />
        <PDFOptions v-if="tab === 'pdf-options'" :ref="el => (forms[2] = el as { dirty: boolean } | null)" />
        <AI v-if="tab === 'ai'" :ref="el => (forms[3] = el as { dirty: boolean } | null)" />
      </div>
    </SideNavLayout>
  </div>
</template>
