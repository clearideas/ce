<script setup lang="ts">
import { computed } from 'vue'
import { DateTime } from 'luxon'
import prettyBytes from 'pretty-bytes'
import SettingsCard from '../base/SettingsCard.vue'
import { useContentStore } from '../../stores'

const contentStore = useContentStore()
const file = computed(() => contentStore.file)
const updatedAt = computed(() => file.value?.updatedAt || file.value?.uploadedAt)
</script>

<template>
  <SettingsCard class="file-properties-card" :title="`${file?.name ?? ''} Properties`" icon="fasl fa-circle-info">
    <div class="file-properties properties-two-column">
      <div class="properties-table">
        <div class="property property-category">
          <div class="property-label">File details</div>
          <div class="property-content"></div>
        </div>
        <div class="property"><div class="property-label">Name:</div><div class="property-content">{{ file?.name }}</div></div>
        <div class="property"><div class="property-label">Type:</div><div class="property-content">{{ file?.contentType || 'Unknown' }}</div></div>
        <div class="property"><div class="property-label">Size:</div><div class="property-content">{{ file?.size || file?.size === 0 ? prettyBytes(file.size) : 'Unknown' }}</div></div>
        <div class="property"><div class="property-label">Uploaded:</div><div class="property-content">{{ file?.uploadedAt ? DateTime.fromISO(String(file.uploadedAt)).toLocaleString(DateTime.DATETIME_MED) : 'Unknown' }}</div></div>
        <div class="property"><div class="property-label">Last updated:</div><div class="property-content">{{ updatedAt ? DateTime.fromISO(String(updatedAt)).toLocaleString(DateTime.DATETIME_MED) : 'Unknown' }}</div></div>
        <div class="property"><div class="property-label">Location:</div><div class="property-content">{{ file?.folderName || file?.siteName || 'Site root' }}</div></div>
        <div class="property"><div class="property-label">Storage key:</div><div class="property-content">{{ file?.key }}</div></div>
      </div>
    </div>
  </SettingsCard>
</template>
