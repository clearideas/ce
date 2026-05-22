<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import SettingsCard from '../../base/SettingsCard.vue'
import { useSiteStore } from '../../../stores'

import IconSelect from './IconSelect.vue'

const siteStore = useSiteStore()
const isInitialized = ref(false)
const errorMessage = ref('')
const siteIcon = ref<string>('')
const isWriteLockedSite = false

function handleUpdate() {
  if (siteStore.currentSite) {
    siteStore.updateCurrentSite({ icon: siteIcon.value })
  }
}

function initializeComponentState() {
  if (!siteStore.currentSite) return

  siteIcon.value = siteStore.currentSite.icon || 'fa-folder-open'
  errorMessage.value = ''
  isInitialized.value = true
}

watch(() => siteStore.currentSite, initializeComponentState, { immediate: true })
</script>

<template>
  <SettingsCard
    title="Site icon"
    subtitle="Choose the icon used for this site in breadcrumbs, cards, and navigation."
    :is-initialized="isInitialized"
    :store="useSiteStore"
    :error-message="errorMessage"
    action="updateCurrentSite"
    icon="fasl fa-icons"
  >
    <template #content>
      <template v-if="isInitialized">
        <IconSelect v-model="siteIcon" :disabled="isWriteLockedSite" />
      </template>
      <div class="settings-card-footer-inline">
        <BaseButton text="Save icon" :disabled="isWriteLockedSite" @click="handleUpdate" />
      </div>
    </template>
  </SettingsCard>
</template>

<style scoped>
.settings-card-footer-inline {
  display: flex;
  justify-content: flex-start;
  gap: 12px;
  padding-top: 1.25rem;
}
</style>
