<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import MarkdownRenderer from '../../base/MarkdownRenderer.vue'
import SettingsCard from '../../base/SettingsCard.vue'
import { useSiteStore } from '../../../stores'

const siteStore = useSiteStore()
const isInitialized = ref(false)
const errorMessage = ref('')
const siteName = ref<string>('')
const siteVisibility = ref<string>('private')

const canChangeVisibility = computed(() => true)
const canEditSettings = computed(() => true)
const saveButtonText = computed(() => 'Save')

async function handleUpdate() {
  await siteStore.updateCurrentSite({
    name: siteName.value,
    visibility: canChangeVisibility.value ? siteVisibility.value : 'private',
  })
}

function initializeComponentState() {
  if (!siteStore.currentSite) return
  siteName.value = siteStore.currentSite.name
  siteVisibility.value = canChangeVisibility.value ? (siteStore.currentSite.visibility ?? 'private') : 'private'
  errorMessage.value = ''
  isInitialized.value = true
}

function getSiteIdMarkdown(siteId: string) {
  return `\`\`\`text\n${siteId}\n\`\`\``
}

watch(() => siteStore.currentSite, initializeComponentState, { immediate: true })
</script>

<template>
  <SettingsCard
    title="General"
    subtitle="Manage this site's basic details and visibility."
    :is-initialized="isInitialized"
    icon="fasl fa-building"
    :error-message="errorMessage"
  >
    <template #content>
      <h4>Site name</h4>
      <p class="text-body-2">Update the name shown throughout Clear Ideas.</p>
      <VTextField
        v-model="siteName"
        max-width="500"
        class="mb-4"
        maxlength="100"
        :disabled="!canEditSettings"
      />

      <h4>Site ID</h4>
      <p class="text-body-2">Use this identifier for API, MCP, and local integrations.</p>
      <div class="site-id-display">
        <MarkdownRenderer
          :content="getSiteIdMarkdown(siteStore.currentSite?.id ?? '')"
          v-if="siteStore.currentSite?.id"
        />
      </div>

      <VSpacer class="mt-4" />
      <h4>Visibility</h4>
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
        :disabled="!canChangeVisibility || !canEditSettings"
      >
        <VBtn value="public" class="text-none" prepend-icon="fasl fa-globe">Public</VBtn>
        <VBtn value="private" class="text-none" prepend-icon="fasl fa-lock">Private</VBtn>
      </VBtnToggle>
      <p class="text-body-2 mb-0">
        {{ siteVisibility === 'public' ? 'This site is publicly visible.' : 'Only invited users can access this site.' }}
      </p>

      <div class="settings-card-footer-inline">
        <BaseButton :text="saveButtonText" @click="handleUpdate" />
      </div>
    </template>
  </SettingsCard>
</template>

<style scoped lang="scss">
.site-id-display {
  margin-left: -12px !important;
  margin-right: -12px !important;
  margin-top: -12px !important;
  margin-bottom: -12px !important;
  padding: 0 !important;
  width: 100%;
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
