<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '../components/base/PageHeader.vue'
import AccessKeys from '../components/settings/AccessKeys.vue'
import ActiveSessions from '../components/settings/ActiveSessions.vue'
import NotificationSettings from '../components/settings/NotificationSettings.vue'
import ProfileSettings from '../components/settings/ProfileSettings.vue'
import SideNavLayout, { type SideNavItem } from '../components/base/SideNavLayout.vue'
import SiteInvitations from '../components/settings/SiteInvitations.vue'
import SuppressedSites from '../components/settings/SuppressedSites.vue'
import TimeZone from '../components/settings/TimeZone.vue'
import { useUnsavedChangesGuard } from '../composables/useUnsavedChangesGuard'
import { ICONS } from '../icons'
import { useAccessKeyStore, useProfileStore, useSiteStore } from '../stores'

type SettingsSection = 'profile' | 'sites' | 'notifications' | 'sessions' | 'access-keys'

const route = useRoute()
const router = useRouter()
const profileStore = useProfileStore()
const accessKeyStore = useAccessKeyStore()
const siteStore = useSiteStore()

const error = ref('')
const sections: SideNavItem[] = [
  { heading: 'General' },
  { key: 'profile', label: 'Profile', icon: 'fas fa-user' },
  { key: 'sites', label: 'Sites', icon: ICONS.sites },
  { key: 'notifications', label: 'Notifications', icon: ICONS.bell },
  { heading: 'Security' },
  { key: 'sessions', label: 'Active sessions', icon: 'fas fa-shield-halved' },
  { key: 'access-keys', label: 'Access keys', icon: ICONS.key },
]
const sectionPath = (key: string) => `/settings/${key === 'profile' ? '' : key}`
const navItems = sections.map(item =>
  'key' in item ? { ...item, href: router.resolve(sectionPath(item.key)).href } : item,
)
const selectableSections = sections.filter(
  (item): item is { key: SettingsSection; label: string; icon: string } => 'key' in item,
)
const section = computed<SettingsSection>(() => {
  const requested = String(route.params.section || 'profile')
  return selectableSections.some(item => item.key === requested) ? (requested as SettingsSection) : 'profile'
})
const sectionTitle = computed(
  () => `Settings: ${selectableSections.find(item => item.key === section.value)?.label ?? 'Profile'}`,
)

// Forms report their dirty state; leaving the route (or switching section) asks first.
const profileForm = ref<{ dirty: boolean } | null>(null)
const notificationForm = ref<{ dirty: boolean } | null>(null)
const anyDirty = () => Boolean(profileForm.value?.dirty || notificationForm.value?.dirty)
useUnsavedChangesGuard(anyDirty)

function go(key: string) {
  void router.push(sectionPath(key))
}

async function loadSettings() {
  error.value = ''
  try {
    await Promise.all([
      profileStore.getProfile(),
      accessKeyStore.getAccessKeys(),
      siteStore.getSitesIfRequired(),
    ])
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load settings'
  }
}

watch(
  () => route.params.section,
  value => {
    const requested = String(value || 'profile')
    if (!selectableSections.some(item => item.key === requested)) void router.replace('/settings')
  },
  { immediate: true },
)
onMounted(loadSettings)
</script>

<template>
  <div class="ce-settings-page">
    <PageHeader :title="sectionTitle" document-title="Settings" />
    <SideNavLayout
      :items="navItems"
      :model-value="section"
      label="Settings sections"
      @update:model-value="go"
    >
      <VAlert v-if="error" type="error" class="mb-4">{{ error }}</VAlert>

      <div class="site-settings-content-wrap regular-settings-content-wrap d-flex flex-column ga-4">
        <template v-if="section === 'profile'">
          <ProfileSettings ref="profileForm" />
          <TimeZone />
        </template>

        <template v-else-if="section === 'sites'">
          <SiteInvitations />
          <SuppressedSites />
        </template>

        <NotificationSettings v-else-if="section === 'notifications'" ref="notificationForm" />

        <ActiveSessions v-else-if="section === 'sessions'" />

        <AccessKeys v-else-if="section === 'access-keys'" />
      </div>
    </SideNavLayout>
  </div>
</template>

<style scoped>
/* Layout-neutral wrapper: the page header and the side-nav layout sit directly in the content flow. */
.ce-settings-page {
  display: contents;
}
</style>
