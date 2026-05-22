<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import BaseButton from '../base/BaseButton.vue'
import ContentListLoadingState from '../base/ContentListLoadingState.vue'
import SettingsCard from '../base/SettingsCard.vue'
import TableFooter from '../base/TableFooter.vue'
import { useProfileStore, useSiteStore } from '../../stores'

const profileStore = useProfileStore()
const siteStore = useSiteStore()
const isInitialized = ref(false)
const page = ref(1)
const itemsPerPage = ref(5)

const blockedSites = computed(() => siteStore.suppressedSites)
const pagedBlockedSites = computed(() => {
  const start = (page.value - 1) * itemsPerPage.value
  return blockedSites.value.slice(start, start + itemsPerPage.value)
})

onMounted(async () => {
  await siteStore.getSuppressedSitesIfRequired()
  initializeComponentState()
})

function initializeComponentState() {
  if (!profileStore.user?.id || isInitialized.value) return
  isInitialized.value = true
}

async function unblockSite(siteId: string) {
  await profileStore.toggleSuppressedSites(siteId)
  await Promise.all([siteStore.getSites(), siteStore.getSuppressedSites()])
}

watch(() => profileStore.loading, loading => {
  if (!loading) initializeComponentState()
}, { immediate: true })
</script>

<template>
  <SettingsCard
    title="Blocked sites"
    subtitle="Sites you have hidden or suppressed from your workspace."
    icon="fasl fa-ban"
    :is-initialized="isInitialized"
  >
    <div v-if="siteStore.loadingSuppressedSites" class="data-table-wrapper suppressed-sites-loading" aria-hidden="true">
      <ContentListLoadingState :rows="5" variant="site" :show-checkbox="false" />
    </div>
    <div v-else-if="blockedSites.length === 0" class="suppressed-sites-empty ci-empty-state-block">
      <VIcon icon="fasl fa-ban" class="ci-empty-state-icon" />
      <h4 class="ci-empty-state-title">No blocked sites</h4>
      <p class="ci-empty-state-body">You have not blocked any sites.</p>
    </div>
    <div v-else class="settings-management-section">
      <div v-for="site in pagedBlockedSites" :key="site.id" class="settings-management-item">
        <div class="settings-status-item-icon">
          <VImg
            v-if="site.attributes?.media?.icon?.dataUrl"
            :src="site.attributes.media.icon.dataUrl"
            contain
            height="32"
            width="32"
            class="flex-shrink-0"
          />
          <VIcon
            v-else
            :icon="(site.icon && `fasl ${site.icon}`) || 'fasl fa-folder-open'"
            size="24"
            color="primary"
          />
        </div>
        <div class="content min-w-0">
          <div class="title ellipsis">{{ site.name }}</div>
          <div class="subtitle text-medium-emphasis">Blocked site</div>
        </div>
        <div class="suppressed-sites-actions">
          <BaseButton
            text="Unblock"
            color="secondary"
            variant="outlined"
            density="compact"
            @click="unblockSite(site.id)"
          />
        </div>
      </div>
    </div>
    <TableFooter
      v-if="blockedSites.length > 0"
      v-model:page="page"
      v-model:items-per-page="itemsPerPage"
      :items="blockedSites"
      :show-page-size="false"
      item-label="site"
    />
  </SettingsCard>
</template>

<style scoped>
.suppressed-sites-empty {
  width: 100%;
}

.suppressed-sites-loading {
  min-height: 360px;
  padding: 0 !important;
  margin: 0 !important;
}

.suppressed-sites-loading :deep(.content-list-loading-state) {
  margin: 0 !important;
  padding: 0 !important;
}

.suppressed-sites-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 600px) {
  .suppressed-sites-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
