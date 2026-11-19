<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import SettingsCard from '../../base/SettingsCard.vue'
import { ICONS } from '../../../icons'
import { useDirtyForm } from '../../../composables/useDirtyForm'
import { useSiteStore } from '../../../stores'

const siteStore = useSiteStore()
const isInitialized = ref(false)
const errorMessage = ref('')
const siteName = ref<string>('')
const siteVisibility = ref<string>('private')

const saving = ref(false)
const { dirty, markClean } = useDirtyForm(() => ({ name: siteName.value, visibility: siteVisibility.value }))
defineExpose({ dirty })

async function handleUpdate() {
  saving.value = true
  try {
    await siteStore.updateCurrentSite({ name: siteName.value.trim(), visibility: siteVisibility.value })
    markClean()
  } finally {
    saving.value = false
  }
}

function initializeComponentState() {
  if (!siteStore.currentSite) return
  siteName.value = siteStore.currentSite.name
  siteVisibility.value = siteStore.currentSite.visibility ?? 'private'
  errorMessage.value = ''
  isInitialized.value = true
  markClean()
}

const siteIdCopied = ref(false)
async function copySiteId() {
  const siteId = siteStore.currentSite?.id
  if (!siteId || !navigator.clipboard) return
  await navigator.clipboard.writeText(siteId)
  siteIdCopied.value = true
  window.setTimeout(() => (siteIdCopied.value = false), 2000)
}

watch(() => siteStore.currentSite, initializeComponentState, { immediate: true })
</script>

<template>
  <SettingsCard
    title="General"
    subtitle="Manage this site's basic details and visibility."
    :is-initialized="isInitialized"
    icon="fas fa-building"
    :error-message="errorMessage"
    :dirty="dirty"
  >
    <template #content>
      <h3>Site name</h3>
      <p class="text-body-2">Update the name shown throughout Clear Ideas.</p>
      <VTextField v-model="siteName" aria-label="Site name" max-width="500" class="mb-4" maxlength="100" />

      <h3>Site ID</h3>
      <p class="text-body-2">Use this identifier for API, MCP, and local integrations.</p>
      <VTextField
        :model-value="siteStore.currentSite?.id ?? ''"
        aria-label="Site ID"
        readonly
        max-width="500"
        class="mb-4 site-id-field"
      >
        <template #append-inner>
          <BaseButton
            :icon="siteIdCopied ? ICONS.check : ICONS.copy"
            intent="tertiary"
            size="small"
            density="comfortable"
            :tooltip="siteIdCopied ? 'Copied' : 'Copy site ID'"
            :aria-label="siteIdCopied ? 'Site ID copied' : 'Copy site ID'"
            @click="copySiteId"
          />
        </template>
      </VTextField>

      <h3>Visibility</h3>
      <p class="text-body-2">Choose whether this site is private or publicly visible.</p>
      <VBtnToggle
        v-model="siteVisibility"
        class="visibility-toggle mb-2"
        color="primary"
        mandatory
        divided
        rounded="xl"
        density="comfortable"
        border
        variant="text"
      >
        <VBtn value="public" class="text-none" prepend-icon="fas fa-globe">Public</VBtn>
        <VBtn value="private" class="text-none" prepend-icon="fas fa-lock">Private</VBtn>
      </VBtnToggle>
      <p class="text-body-2 mb-0">
        {{
          siteVisibility === 'public'
            ? 'This site is publicly visible.'
            : 'Only invited users can access this site.'
        }}
      </p>

      <div class="settings-card-footer-inline">
        <BaseButton
          text="Save"
          :loading="saving"
          :disabled="!dirty || !siteName.trim()"
          @click="handleUpdate"
        />
      </div>
    </template>
  </SettingsCard>
</template>

<style scoped lang="scss">
.site-id-field :deep(input) {
  font-family: var(--ci-font-family-mono);
  font-size: 0.85rem;
}

.visibility-toggle {
  width: min(100%, 280px);
  overflow: hidden;
}

.visibility-toggle :deep(.v-btn) {
  flex: 1 1 50%;
  min-width: 0;
  letter-spacing: 0;
  opacity: 0.8;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    opacity 0.2s ease;
}

.visibility-toggle :deep(.v-btn--active) {
  opacity: 1;
  background-color: rgba(var(--v-theme-primary), 0.15);
}

.settings-card-footer-inline {
  display: flex;
  justify-content: flex-start;
  gap: 12px;
  padding-top: 1.25rem;
}
</style>
