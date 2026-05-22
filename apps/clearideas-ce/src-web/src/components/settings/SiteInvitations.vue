<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import BaseButton from '../base/BaseButton.vue'
import IconCheckbox from '../base/IconCheckbox.vue'
import SettingsCard from '../base/SettingsCard.vue'
import { useProfileStore, useSiteStore } from '../../stores'

const profileStore = useProfileStore()
const siteStore = useSiteStore()
const isInitialized = ref(false)
const autoAcceptInvites = ref(true)

const pendingSites = computed(() =>
  siteStore.sites.filter(site => site.currentUserRole && site.owned === false),
)

onMounted(async () => {
  await siteStore.getSitesIfRequired()
  initializeComponentState()
})

function initializeComponentState() {
  if (!profileStore.user?.id || isInitialized.value) return
  autoAcceptInvites.value = profileStore.user.attributes?.sites?.autoAcceptInvites ?? true
  isInitialized.value = true
}

async function updateAutoAcceptInvites() {
  const attributes = profileStore.user?.attributes ?? {}
  const sites = attributes.sites ?? {}
  await profileStore.updateProfile({
    attributes: {
      ...attributes,
      sites: {
        ...sites,
        autoAcceptInvites: autoAcceptInvites.value,
      },
    },
  })
}

async function acceptInvitation(siteId: string) {
  await siteStore.acceptSiteInvitation(siteId)
  await profileStore.getProfile()
}

async function suppressInvitation(siteId: string) {
  await siteStore.suppressSiteInvitation(siteId)
  await profileStore.getProfile()
}

watch(() => profileStore.loading, loading => {
  if (!loading) initializeComponentState()
}, { immediate: true })
</script>

<template>
  <SettingsCard
    title="Site invitations"
    subtitle="Choose whether site invitations are accepted automatically and review pending shared sites."
    icon="fasl fa-envelope-open-text"
    :is-initialized="isInitialized"
  >
    <template #content>
      <IconCheckbox
        v-model="autoAcceptInvites"
        label="Automatically accept site invitations"
        description="When enabled, sites shared with you are added to your site list without asking first."
        class="mb-4"
        @change="updateAutoAcceptInvites"
      />

      <div v-if="siteStore.loadingSites" class="text-center py-8">
        <VProgressCircular indeterminate />
        <div class="mt-2">Loading site invitations</div>
      </div>
      <VEmptyState v-else-if="pendingSites.length === 0 && !autoAcceptInvites" title="No pending invitations">
        <template #text>
          <p class="text-medium-emphasis">Pending site invitations will appear here.</p>
        </template>
        <template #media>
          <VIcon icon="fasl fa-envelope-open-text" />
        </template>
      </VEmptyState>
      <div v-else-if="pendingSites.length > 0" class="settings-management-section">
        <div v-for="site in pendingSites" :key="site.id" class="settings-management-item">
          <div class="settings-status-item-icon">
            <VImg
              v-if="site.attributes?.media?.icon?.dataUrl"
              :src="site.attributes.media.icon.dataUrl"
              contain
              height="32"
              width="32"
            />
            <VIcon
              v-else
              :icon="(site.icon && `fasl ${site.icon}`) || 'fasl fa-folder-open'"
              size="24"
              color="primary"
            />
          </div>
          <div class="d-flex flex-column flex-grow-1 min-w-0">
            <div class="title ellipsis">{{ site.name }}</div>
            <div class="subtitle">
              <div class="text-caption text-medium-emphasis">Shared site</div>
            </div>
          </div>
          <div class="site-invitations-actions">
            <BaseButton text="Suppress" color="secondary" variant="outlined" density="compact" @click="suppressInvitation(site.id)" />
            <BaseButton text="Accept" color="primary" variant="flat" density="compact" @click="acceptInvitation(site.id)" />
          </div>
        </div>
      </div>
    </template>
  </SettingsCard>
</template>

<style scoped>
.site-invitations-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 600px) {
  .site-invitations-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
