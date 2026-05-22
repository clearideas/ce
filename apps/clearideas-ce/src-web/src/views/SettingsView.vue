<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '../components/base/BaseButton.vue'
import IconCheckbox from '../components/base/IconCheckbox.vue'
import SettingsCard from '../components/base/SettingsCard.vue'
import NewAccessKey from '../components/settings/NewAccessKey.vue'
import SettingsMenu from '../components/settings/SettingsMenu.vue'
import Schedule, { type NotificationSchedule } from '../components/settings/Schedule.vue'
import SiteInvitations from '../components/settings/SiteInvitations.vue'
import SuppressedSites from '../components/settings/SuppressedSites.vue'
import TimeZone from '../components/settings/TimeZone.vue'
import { useAlert } from '../composables/useAlert'
import { useAccessKeyStore, useAuthStore, useProfileStore, useSiteStore } from '../stores'
import type { NotificationAction } from '../types/domain'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const profileStore = useProfileStore()
const accessKeyStore = useAccessKeyStore()
const siteStore = useSiteStore()
const alert = useAlert()
const profileRefs = storeToRefs(profileStore)
const accessKeyRefs = storeToRefs(accessKeyStore)
const siteRefs = storeToRefs(siteStore)
const profileUser = profileRefs.user
const profileAccount = profileRefs.account
const accessKeys = accessKeyRefs.accessKeys
const newKey = accessKeyRefs.newKey
const sites = siteRefs.sites

const error = ref('')
const profileForm = reactive({ displayName: '', accountName: '' })
const savingProfile = ref(false)
const savingNotifications = ref(false)
const notifications = ref<NotificationSchedule>({
  frequency: 'daily',
  hours: ['09:00', '17:00'],
  days: [],
})
const subscribedSites = ref<string[]>([])
const subscribedActions = ref<NotificationAction[]>([])
const subscribedAdminActions = ref<NotificationAction[]>([])

const section = computed(() => String(route.params.section || 'profile'))
const sections = [
  { heading: true, label: 'General' },
  { key: 'profile', label: 'Profile', icon: 'fasl fa-user' },
  { key: 'sites', label: 'Sites', icon: 'fasl fa-house' },
  { key: 'notifications', label: 'Notifications', icon: 'fasl fa-bell' },
  { heading: true, label: 'Security' },
  { key: 'sessions', label: 'Active sessions', icon: 'fasl fa-shield-halved' },
  { key: 'access-keys', label: 'Access keys', icon: 'fasl fa-key' },
]

const selectableSections = computed(() => sections.filter((item): item is { key: string; label: string; icon: string } => 'key' in item))
const currentSession = computed(() => authStore.session)
const notifiableActions = computed<Array<{ title: string; value: NotificationAction }>>(() => [
  { title: 'Uploaded', value: 'uploaded' },
])
const notifiableAdminActions = computed<Array<{ title: string; value: NotificationAction }>>(() => [
  { title: 'Uploaded', value: 'uploaded' },
  { title: 'Deleted', value: 'deleted' },
  { title: 'Created', value: 'created' },
  { title: 'Made public', value: 'made-public' },
  { title: 'Made private', value: 'made-private' },
  { title: 'Added user', value: 'added-user' },
  { title: 'Removed user', value: 'removed-user' },
  { title: 'Sent invitation email', value: 'sent-invitation-email' },
  { title: 'Accepted invitation', value: 'accepted-invitation' },
  { title: 'Requested export', value: 'requested-export' },
  { title: 'Exported', value: 'exported' },
  { title: 'Unzipped', value: 'unzipped' },
])

function go(key: string) {
  void router.push(`/settings/${key === 'profile' ? '' : key}`)
}

function syncForms() {
  profileForm.displayName = profileUser.value?.displayName || profileUser.value?.name || ''
  profileForm.accountName = profileAccount.value?.name || ''
  syncNotificationForms()
}

function syncNotificationForms() {
  const userNotifications = profileUser.value?.attributes?.notifications
  const defaultNotifications: NotificationSchedule = {
    frequency: 'daily',
    hours: ['09:00', '17:00'],
    days: [],
  }
  notifications.value = {
    ...defaultNotifications,
    ...(userNotifications ?? {}),
    hours: Array.isArray(userNotifications?.hours) ? userNotifications.hours : defaultNotifications.hours,
    days: Array.isArray(userNotifications?.days) ? userNotifications.days : defaultNotifications.days,
  } as NotificationSchedule
  subscribedAdminActions.value = [...(userNotifications?.subscribedAdminActions ?? ['uploaded', 'created', 'deleted'])]
  subscribedActions.value = [...(userNotifications?.subscribedActions ?? ['uploaded'])]
  const suppressed = profileUser.value?.attributes?.sites?.suppressNotifications ?? []
  subscribedSites.value = sites.value.map(site => site.id).filter(siteId => !suppressed.includes(siteId))
}

async function loadSettings() {
  error.value = ''
  try {
    await Promise.all([profileStore.getProfile(), accessKeyStore.getAccessKeys(), siteStore.getSitesIfRequired()])
    syncForms()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load settings'
  }
}

async function saveProfile() {
  savingProfile.value = true
  error.value = ''
  try {
    await profileStore.updateProfile({ displayName: profileForm.displayName }, { silent: true })
    await profileStore.updateAccount({ name: profileForm.accountName }, { silent: true })
    alert.add({ message: 'Profile updated.', type: 'success', timeout: 3000 })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Profile could not be updated.'
    alert.add({ message: error.value, type: 'error', timeout: 5000 })
    throw err
  } finally {
    savingProfile.value = false
  }
}

async function revokeKey(keyId: string) {
  await accessKeyStore.revokeAccessKey(keyId)
}

async function saveNotifications() {
  savingNotifications.value = true
  error.value = ''
  try {
    const sitesToSuppress = sites.value.map(site => site.id).filter(siteId => !subscribedSites.value.includes(siteId))
    await profileStore.updateProfile({
      attributes: {
        notifications: {
          ...notifications.value,
          subscribedAdminActions: subscribedAdminActions.value,
          subscribedActions: subscribedActions.value,
        },
        sites: {
          suppressNotifications: sitesToSuppress,
        },
      },
    }, { silent: true })
    alert.add({ message: 'Notification settings updated.', type: 'success', timeout: 3000 })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Notification settings could not be updated.'
    alert.add({ message: error.value, type: 'error', timeout: 5000 })
    throw err
  } finally {
    savingNotifications.value = false
  }
}

async function logoutCurrentSession() {
  await authStore.logout()
  await router.push('/login')
}

function formatDate(value?: string | null) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function isExpired(value?: string | null) {
  return Boolean(value && new Date(value) < new Date())
}

watch([profileUser, profileAccount, sites], syncForms)
watch(section, value => {
  if (!selectableSections.value.some(item => item.key === value)) {
    void router.replace('/settings')
  }
}, { immediate: true })
onMounted(loadSettings)
</script>

<template>
  <div class="settings ce-settings-page">
    <div class="settings-left settings-menu-pane">
      <SettingsMenu :section="section" :sections="sections" @select="go" />
    </div>
    <div class="settings-right">
      <div class="settings-content-viewport">
        <div class="d-flex flex-column ga-3 settings-content-scroll">
          <VAlert v-if="error" type="error" class="mb-4">{{ error }}</VAlert>

          <div class="site-settings-content-wrap regular-settings-content-wrap d-flex flex-column ga-4">
            <template v-if="section === 'profile' || section === ''">
              <SettingsCard title="Profile" subtitle="Manage your display name, account name, and local time zone." icon="fasl fa-id-card" :is-initialized="!profileStore.loading">
                <h4>Email</h4>
                <p class="text-body-2 profile-readonly-value">{{ profileUser?.email }}</p>
                <div class="mt-4"></div>
                <h4>Display name</h4>
                <p class="text-body-2">This name appears in the CE app shell and activity context.</p>
                <VTextField v-model="profileForm.displayName" class="mb-4" max-width="500" maxlength="50" />
                <h4>Account name</h4>
                <p class="text-body-2">This is the local account/workspace label.</p>
                <VTextField v-model="profileForm.accountName" class="mb-4" max-width="500" maxlength="100" />
                <template #footer>
                  <BaseButton text="Update profile" color="primary" variant="flat" :loading="savingProfile" @click="saveProfile" />
                </template>
              </SettingsCard>

              <TimeZone />
            </template>

            <template v-else-if="section === 'sites'">
              <SiteInvitations />
              <SuppressedSites />
            </template>

            <template v-else-if="section === 'notifications'">
          <SettingsCard title="Notification settings" subtitle="Customize the types of notifications you receive and their frequency." icon="fasl fa-envelope" :is-initialized="!profileStore.loading">
            <template #content>
              <p>
                You will receive notifications by email at:
                <strong>{{ profileUser?.email }}</strong>
              </p>
              <h4>Frequency</h4>
              <Schedule v-model="notifications" title="Notifications" :show-monthly="false" />
              <h4>Types of notifications</h4>
              <p class="text-body-2">
                Select the types of notifications you want to receive. You will receive these notifications for sites you administer.
              </p>
              <div class="d-flex flex-wrap ga-4">
                <IconCheckbox
                  v-for="action in notifiableAdminActions"
                  :id="action.value"
                  :key="action.value"
                  v-model="subscribedAdminActions"
                  :label="action.title"
                  width="300"
                />
              </div>
            </template>
            <template #footer>
              <BaseButton text="Save notification settings" color="primary" variant="flat" :loading="savingNotifications" @click="saveNotifications" />
            </template>
          </SettingsCard>

          <SettingsCard title="Notifications for sites shared with you" subtitle="Choose which shared-site activity should notify you." icon="fasl fa-bell" :is-initialized="!profileStore.loading">
            <template #content>
              <h4>Types of notifications</h4>
              <p class="text-body-2">
                Select the types of notifications you want to receive for sites that are shared with you.
              </p>
              <div class="d-flex flex-wrap ga-4">
                <IconCheckbox
                  v-for="action in notifiableActions"
                  :id="action.value"
                  :key="action.value"
                  v-model="subscribedActions"
                  :label="action.title"
                  width="300"
                />
              </div>
              <div class="mt-4"></div>
              <h4>Subscribed sites</h4>
              <div class="d-flex flex-wrap ga-4">
                <IconCheckbox
                  v-for="site in sites"
                  :id="site.id"
                  :key="site.id"
                  v-model="subscribedSites"
                  :label="site.name"
                  width="300"
                />
              </div>
              <VAlert v-if="sites.length === 0" type="info" variant="tonal" class="mt-4">
                No sites are available yet.
              </VAlert>
            </template>
            <template #footer>
              <BaseButton text="Save site notification settings" color="primary" variant="flat" :loading="savingNotifications" @click="saveNotifications" />
            </template>
          </SettingsCard>
        </template>

        <template v-else-if="section === 'sessions'">
          <SettingsCard title="Active sessions" subtitle="Manage devices and sessions signed in to your account." icon="fasl fa-shield-halved" :is-initialized="!authStore.loading">
            <div class="session-management">
              <div class="header mb-6">
                <div class="d-flex ga-2 align-center justify-start">
                  <BaseButton text="Refresh" prepend-icon="fasl fa-rotate-right" color="primary" size="default" variant="flat" @click="authStore.getSession()" />
                </div>
              </div>
              <div class="active-sessions-section">
                <div class="settings-management-section d-flex flex-column ga-3 mb-6">
                  <div class="settings-management-item" style="border-color: rgb(var(--v-theme-primary)); border-width: 2px">
                    <VIcon icon="fasl fa-globe" size="24" color="primary" class="settings-status-item-icon" />
                    <div class="d-flex flex-column flex-grow-1">
                      <div class="title d-flex align-center ga-2">
                        Web
                        <VChip size="x-small" color="default">Browser</VChip>
                        <VChip size="x-small" color="success" prepend-icon="fasl fa-check">Current</VChip>
                      </div>
                      <div class="subtitle mt-1">
                        <div class="text-caption text-medium-emphasis">
                          Signed in as {{ currentSession?.user.email }} using Better Auth.
                        </div>
                        <div class="text-caption text-medium-emphasis d-flex ga-2 mt-1">
                          <span>Local CE app</span>
                          <span>•</span>
                          <span>Session storage: MongoDB adapter</span>
                        </div>
                      </div>
                    </div>
                    <div class="d-flex gap-2">
                      <BaseButton text="Log out" color="warning" variant="outlined" size="small" @click="logoutCurrentSession" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SettingsCard>
        </template>

        <template v-else-if="section === 'access-keys'">
          <SettingsCard title="Access keys" subtitle="Create and revoke keys for API and MCP integrations." icon="fasl fa-key" :is-initialized="!accessKeyStore.loading">
            <div class="access-key-management">
              <div class="header mb-6">
                <div class="d-flex flex-wrap ga-2 align-center justify-start">
                  <NewAccessKey size="default" />
                </div>
              </div>
              <div v-if="newKey" class="settings-management-section d-flex flex-column ga-3 mb-6">
                <div class="settings-management-item" style="border-color: rgb(var(--v-theme-success)); border-width: 2px">
                  <VIcon icon="fasl fa-key" size="24" color="success" class="settings-status-item-icon" />
                  <div class="d-flex flex-column flex-grow-1">
                    <div class="title d-flex align-center ga-2">
                      Save this key now
                      <VChip size="x-small" color="success">MCP</VChip>
                    </div>
                    <div class="subtitle mt-1">
                      <div class="text-caption text-medium-emphasis mb-2">
                        This secret will not be shown again.
                      </div>
                      <code class="secret-box">{{ newKey }}</code>
                    </div>
                  </div>
                  <div class="d-flex gap-2">
                    <BaseButton text="Saved this key" color="success" variant="outlined" size="small" @click="accessKeyStore.clearNewKey()" />
                  </div>
                </div>
              </div>
              <div class="access-keys-list">
                <div v-if="accessKeyStore.loading" class="text-center py-8">
                  <VProgressCircular indeterminate />
                  <div class="mt-2">Loading access keys</div>
                </div>
                <VEmptyState v-else-if="accessKeys.length === 0" title="No access keys">
                  <template #text><p class="text-medium-emphasis">Create an access key to connect local integrations.</p></template>
                  <template #media><VIcon icon="fasl fa-key" /></template>
                  <template #actions><NewAccessKey size="default" /></template>
                </VEmptyState>
                <div v-else class="settings-management-section d-flex flex-column ga-3">
                  <div v-for="key in accessKeys" :key="key.id" class="settings-management-item" :class="{ 'opacity-60': key.isActive === false }">
                    <VIcon icon="fasl fa-microchip" size="24" :color="key.isActive === false ? 'default' : 'primary'" class="settings-status-item-icon" />
                    <div class="d-flex flex-column flex-grow-1">
                      <div class="title d-flex align-center ga-2">
                        {{ key.name }}
                        <VChip size="x-small" :color="key.isActive === false ? 'default' : 'primary'">{{ key.keyType.toUpperCase() }}</VChip>
                        <VChip v-if="key.isActive === false" size="x-small" color="error" prepend-icon="fasl fa-ban">Revoked</VChip>
                        <VChip v-else-if="isExpired(key.expiresAt)" size="x-small" color="warning" prepend-icon="fasl fa-clock">Expired</VChip>
                      </div>
                      <div class="subtitle mt-1">
                        <div class="text-caption text-medium-emphasis d-flex flex-wrap ga-2">
                          <span>Created: {{ formatDate(key.createdAt) }}</span>
                          <span>•</span>
                          <span>Last used: {{ formatDate(key.lastUsedAt) }}</span>
                          <template v-if="key.expiresAt"><span>•</span><span>Expires: {{ formatDate(key.expiresAt) }}</span></template>
                        </div>
                        <div class="text-caption text-medium-emphasis mt-1">
                          Scopes: {{ key.scopes.join(', ') }}
                        </div>
                      </div>
                    </div>
                    <div class="d-flex gap-2">
                      <BaseButton :text="key.isActive === false ? 'Revoked' : 'Revoke'" variant="outlined" size="small" :color="key.isActive === false ? 'default' : 'error'" :disabled="key.isActive === false" @click="revokeKey(key.id)" />
                    </div>
                  </div>
                </div>
              </div>
              <VAlert v-if="accessKeyStore.error" type="error" variant="tonal" class="mt-4" closable @click:close="accessKeyStore.clearError()">
                {{ accessKeyStore.error }}
              </VAlert>
            </div>
          </SettingsCard>
        </template>

      </div>
    </div>
  </div>
  </div>
  </div>
</template>
