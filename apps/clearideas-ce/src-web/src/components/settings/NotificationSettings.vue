<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import BaseButton from '../base/BaseButton.vue'
import IconCheckbox from '../base/IconCheckbox.vue'
import SettingsCard from '../base/SettingsCard.vue'
import Schedule from './Schedule.vue'
import { normalizeSchedule, type NotificationSchedule } from '../../utils/schedule'
import { useAlert } from '../../composables/useAlert'
import { useDirtyForm } from '../../composables/useDirtyForm'
import { useProfileStore, useSiteStore } from '../../stores'
import type { NotificationAction } from '../../types/domain'

/** Email digest schedule, notification types and per-site subscriptions. */
const profileStore = useProfileStore()
const siteStore = useSiteStore()
const { user, loading } = storeToRefs(profileStore)
const { sites } = storeToRefs(siteStore)
const alert = useAlert()

const DEFAULT_SCHEDULE: NotificationSchedule = { frequency: 'daily', hours: ['09:00', '17:00'], days: [] }
const notifications = ref<NotificationSchedule>({ ...DEFAULT_SCHEDULE })
const subscribedSites = ref<string[]>([])
const subscribedActions = ref<NotificationAction[]>([])
const subscribedAdminActions = ref<NotificationAction[]>([])
const saving = ref(false)
const errorMessage = ref('')

const { dirty, markClean } = useDirtyForm(() => ({
  notifications: notifications.value,
  subscribedSites: subscribedSites.value,
  subscribedActions: subscribedActions.value,
  subscribedAdminActions: subscribedAdminActions.value,
}))
defineExpose({ dirty })

const notifiableActions: Array<{ title: string; value: NotificationAction }> = [
  { title: 'Uploaded', value: 'uploaded' },
]
const notifiableAdminActions: Array<{ title: string; value: NotificationAction }> = [
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
]
const initialized = computed(() => !loading.value)

function syncFromStore() {
  const saved = user.value?.attributes?.notifications
  // Copy the arrays: the schedule editor binds `hours[0]`/`hours[1]` directly, and editing must not
  // write through to the profile in the store (or to the shared defaults) before Save.
  notifications.value = normalizeSchedule({
    ...DEFAULT_SCHEDULE,
    ...(saved ?? {}),
    hours: [...(Array.isArray(saved?.hours) ? saved.hours : DEFAULT_SCHEDULE.hours)],
    days: [...(Array.isArray(saved?.days) ? saved.days : DEFAULT_SCHEDULE.days)],
  } as NotificationSchedule)
  subscribedAdminActions.value = [...(saved?.subscribedAdminActions ?? ['uploaded', 'created', 'deleted'])]
  subscribedActions.value = [...(saved?.subscribedActions ?? ['uploaded'])]
  const suppressed = user.value?.attributes?.sites?.suppressNotifications ?? []
  subscribedSites.value = sites.value.map(site => site.id).filter(siteId => !suppressed.includes(siteId))
  markClean()
}

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    const attributes = user.value?.attributes ?? {}
    const suppressNotifications = sites.value
      .map(site => site.id)
      .filter(siteId => !subscribedSites.value.includes(siteId))
    await profileStore.updateProfile(
      {
        attributes: {
          notifications: {
            ...notifications.value,
            subscribedAdminActions: subscribedAdminActions.value,
            subscribedActions: subscribedActions.value,
          },
          // `sites` is one attribute key on the server: spread the existing values so favourites and
          // blocked sites survive a notification save.
          sites: { ...(attributes.sites ?? {}), suppressNotifications },
        },
      },
      { silent: true },
    )
    markClean()
    alert.add({ message: 'Notification settings updated.', type: 'success', timeout: 3000 })
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Notification settings could not be updated.'
  } finally {
    saving.value = false
  }
}

watch([user, sites], syncFromStore, { immediate: true })
</script>

<template>
  <SettingsCard
    title="Notification settings"
    subtitle="Choose what you are notified about and how often."
    icon="fas fa-envelope"
    :is-initialized="initialized"
    :dirty="dirty"
    :error-message="errorMessage"
  >
    <template #content>
      <p>
        Notifications are sent by email to
        <strong>{{ user?.email }}</strong>
      </p>
      <h3>Frequency</h3>
      <Schedule v-model="notifications" title="Notifications" :show-monthly="false" />
      <h3>Sites you administer</h3>
      <p class="text-body-2">Activity in sites where you are an owner or admin.</p>
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
      <h3 class="mt-4">Sites shared with you</h3>
      <p class="text-body-2">Activity in sites where you are a member.</p>
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
      <h3 class="mt-4">Subscribed sites</h3>
      <p class="text-body-2">Untick a site to stop receiving notifications about it.</p>
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
      <VAlert v-if="sites.length === 0" type="info" variant="tonal" class="mt-4"
        >No sites are available yet.</VAlert
      >
    </template>
    <template #footer>
      <BaseButton text="Save notification settings" :loading="saving" :disabled="!dirty" @click="save" />
    </template>
  </SettingsCard>
</template>
