<script setup lang="ts">
import { ref, watch } from 'vue'
import SettingsCard from '../../base/SettingsCard.vue'
import SiteMediaDropZone from '../actions/SiteMediaDropZone.vue'
import { useSiteStore } from '../../../stores'

const siteStore = useSiteStore()
const isInitialized = ref(false)
const isWriteLockedSite = false

function initializeComponentState() {
  if (!siteStore.currentSite) return
  isInitialized.value = true
}

watch(() => siteStore.currentSite, initializeComponentState, { immediate: true })
</script>

<template>
  <SettingsCard
    title="Custom branding"
    subtitle="Upload a custom site icon and logo for this site."
    :is-initialized="isInitialized"
    :store="useSiteStore"
    action="updateCurrentSite"
    icon="fasl fa-image"
  >
    <template #content>
      <p class="text-body-2">Supported types: PNG, GIF, JPG, WEBP, and SVG.</p>
      <div class="d-flex w-100 flex-row gap-4">
        <div>
          <h4 class="ci-settings-section-title">Site icon</h4>
          <SiteMediaDropZone
            :site-id="siteStore.currentSiteId!"
            media-type="icon"
            :disabled="isWriteLockedSite"
            :height="180"
            :width="180"
          />
        </div>
        <div>
          <h4 class="ci-settings-section-title">Site logo</h4>
          <SiteMediaDropZone
            :site-id="siteStore.currentSiteId!"
            media-type="logo"
            :disabled="isWriteLockedSite"
            :show-as-image="true"
            text="Upload logo"
            :height="180"
            :width="420"
          />
        </div>
      </div>
    </template>
  </SettingsCard>
</template>
