<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import IconCheckbox from '../../base/IconCheckbox.vue'
import SettingsCard from '../../base/SettingsCard.vue'
import { useDirtyForm } from '../../../composables/useDirtyForm'
import { useSiteStore } from '../../../stores'

const siteStore = useSiteStore()
const isInitialized = ref(false)
const errorMessage = ref('')
const notificationsEnabled = ref(false)
const saving = ref(false)
const { dirty, markClean } = useDirtyForm(() => notificationsEnabled.value)
defineExpose({ dirty })

function initializeComponentState() {
  if (!siteStore.currentSite) return
  notificationsEnabled.value = siteStore.currentSite.attributes?.notifications ?? false
  errorMessage.value = ''
  isInitialized.value = true
  markClean()
}

async function handleUpdate() {
  saving.value = true
  try {
    await siteStore.updateCurrentSite({ attributes: { notifications: notificationsEnabled.value } })
    markClean()
  } finally {
    saving.value = false
  }
}

watch(() => siteStore.currentSite, initializeComponentState, { immediate: true })
</script>

<template>
  <SettingsCard
    title="Notifications"
    subtitle="Control site-level notification delivery for activity on this site."
    :is-initialized="isInitialized"
    icon="fas fa-bell"
    :error-message="errorMessage"
    :dirty="dirty"
  >
    <template #content>
      <div class="d-flex flex-column ga-4 mb-6">
        <IconCheckbox
          v-model="notificationsEnabled"
          label="Enable notifications"
          description="Send basic notifications for supported CE site activity."
        />
      </div>
    </template>
    <template #footer>
      <BaseButton text="Save" :loading="saving" :disabled="!dirty" @click="handleUpdate" />
    </template>
  </SettingsCard>
</template>
