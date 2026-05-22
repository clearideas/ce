<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import SettingsCard from '../../base/SettingsCard.vue'
import IconCheckbox from '../../base/IconCheckbox.vue'
import { useSiteStore } from '../../../stores'
const siteStore = useSiteStore()
const isInitialized = ref(false)
const errorMessage = ref('')
const notificationsEnabled = ref(false)
function initializeComponentState() { if (!siteStore.currentSite) return; notificationsEnabled.value = siteStore.currentSite.attributes?.notifications ?? false; errorMessage.value = ''; isInitialized.value = true }
async function handleUpdate() { await siteStore.updateCurrentSite({ attributes: { notifications: notificationsEnabled.value } }) }
watch(() => siteStore.currentSite, initializeComponentState, { immediate: true })
</script>
<template>
  <SettingsCard title="Notifications" subtitle="Control site-level notification delivery for activity on this site." :is-initialized="isInitialized" icon="fasl fa-bell-exclamation" :error-message="errorMessage">
    <template #content><div class="d-flex flex-column ga-4 mb-6"><IconCheckbox v-model="notificationsEnabled" label="Enable notifications" description="Send basic notifications for supported CE site activity." /></div></template>
    <template #footer><BaseButton text="Save notifications" color="primary" variant="flat" @click="handleUpdate" /></template>
  </SettingsCard>
</template>
