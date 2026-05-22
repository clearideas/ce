<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SettingsMenu from '../base/SettingsMenu.vue'
import AI from './settings/AI.vue'
import CustomBranding from './settings/CustomBranding.vue'
import General from './settings/General.vue'
import Notifications from './settings/Notifications.vue'
import PDFOptions from './settings/PDFOptions.vue'
import SiteIcon from './settings/SiteIcon.vue'

interface Props { siteId?: string; requestedTab?: string | null }
const SITE_SETTINGS_TAB_SLUGS: Record<string, string> = {
  icons: 'branding',
}

const SITE_SETTINGS_SLUG_TABS = Object.fromEntries(
  Object.entries(SITE_SETTINGS_TAB_SLUGS).map(([tabName, slug]) => [slug, tabName]),
)

const props = defineProps<Props>()
const route = useRoute()
const router = useRouter()
const tab = ref('general')
const OpenedGroup = ref<string[]>([])
const visibleSiteSettingsMenuItems = computed(() => [
  { title: 'General', tab: 'general', icon: 'fasl fa-gear' },
  { title: 'Icons and branding', tab: 'icons', icon: 'fasl fa-icons' },
  { title: 'Notifications', tab: 'notifications', icon: 'fasl fa-bell' },
  { title: 'PDF options', tab: 'pdf-options', icon: 'fasl fa-file-pdf' },
  { title: 'AI', tab: 'ai', icon: 'fasl fa-robot' },
])
const visibleTabKeys = computed(() => visibleSiteSettingsMenuItems.value.map(item => item.tab))
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

watch(tab, nextTab => {
  const siteId =
    props.siteId ??
    (Array.isArray(route.params.siteId) ? route.params.siteId[0] : route.params.siteId)
  if (!siteId) return

  const nextSettingsTab = getSettingsTabSlug(nextTab)
  const currentSettingsTab = Array.isArray(route.params.siteSettingsTab)
    ? route.params.siteSettingsTab[0]
    : route.params.siteSettingsTab
  if (currentSettingsTab === nextSettingsTab) return

  void router.replace({
    name: route.params.folderId ? 'site-folder-tab' : 'site-tab',
    params: {
      siteId,
      ...(route.params.folderId ? { folderId: route.params.folderId } : {}),
      siteTab: 'settings',
      siteSettingsTab: nextSettingsTab,
    },
    query: route.query,
  })
})
</script>
<template>
  <div class="site-settings">
    <SettingsMenu v-model:tab="tab" v-model:openedGroup="OpenedGroup" :menu="visibleSiteSettingsMenuItems">
      <div class="site-settings-content-wrap d-flex flex-column ga-4">
        <General v-if="tab === 'general'" />
        <SiteIcon v-if="tab === 'icons'" />
        <CustomBranding v-if="tab === 'icons'" />
        <Notifications v-if="tab === 'notifications'" />
        <PDFOptions v-if="tab === 'pdf-options'" />
        <AI v-if="tab === 'ai'" />
      </div>
    </SettingsMenu>
  </div>
</template>
