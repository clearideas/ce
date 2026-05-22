<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '../base/BaseButton.vue'
import SettingsCard from '../base/SettingsCard.vue'
import { useProfileStore } from '../../stores'
import TimeZonePicker from './TimeZonePicker.vue'

const profileStore = useProfileStore()
const isInitialized = ref(false)
const timeZone = ref('')

async function handleUpdate() {
  const attributes = profileStore.user?.attributes ?? {}
  await profileStore.updateProfile({
    attributes: {
      ...attributes,
      timeZone: timeZone.value,
    },
  })
}

function initializeComponentState() {
  if (!profileStore.user?.id || isInitialized.value) return
  timeZone.value = profileStore.user.attributes?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
  isInitialized.value = true
}

watch(() => profileStore.loading, loading => {
  if (!loading) initializeComponentState()
}, { immediate: true })
</script>

<template>
  <SettingsCard
    title="Time zone"
    subtitle="Set the time zone used for dates, filters, analytics, and notifications."
    icon="fasl fa-clock"
    :is-initialized="isInitialized"
  >
    <template #content>
      <TimeZonePicker v-model="timeZone" />
    </template>
    <template #footer>
      <BaseButton text="Update time zone" @click="handleUpdate" />
    </template>
  </SettingsCard>
</template>
