<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import BaseTabs from '../components/base/BaseTabs.vue'
import Tag from '../components/base/Tag.vue'
import ContentActions from '../components/content/actions/ContentActions.vue'
import UploadStatus from '../components/content/actions/UploadStatus.vue'
import ContentList from '../components/content/ContentList.vue'
import ContentTiles from '../components/content/ContentTiles.vue'
import Breadcrumbs from '../components/sites/Breadcrumbs.vue'
import User from '../components/users/User.vue'
import UserActions from '../components/users/actions/UserActions.vue'
import Settings from '../components/sites/Settings.vue'
import SiteChat from '../components/sites/SiteChat.vue'
import { provideContentFilters } from '../composables/useContentFilters'
import { useContentStore, useSiteStore, useUserStore } from '../stores'
import PageHeader from '../components/base/PageHeader.vue'
import { usePreferences } from '../composables/usePreferences'
import EmptyState from '../components/base/EmptyState.vue'
import BaseButton from '../components/base/BaseButton.vue'
import LoadError from '../components/base/LoadError.vue'
import { FetchPrivateError } from '../api/fetchPrivate'
import { errorMessage } from '../utils/errors'

const siteStore = useSiteStore()
const { preferences } = usePreferences()
const contentStore = useContentStore()
const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const loading = ref(true)
/**
 * The site could not be opened: `missing` (404/403 — deleted, or you no longer have access) shows a
 * "not available" state; anything else a retryable error. Never the empty content list.
 */
const siteLoadError = ref<{ missing: boolean; message: string } | null>(null)
const selected = ref<string[]>([])
// Sort/filter state shared by the toolbar and both content views (list and tiles).
provideContentFilters()
const { currentSite } = storeToRefs(siteStore)
const siteId = computed(() => String(route.params.siteId))
const canManageSiteUsers = computed(() =>
  ['owner', 'admin'].includes(currentSite.value?.currentUserRole ?? ''),
)
const canManageSiteSettings = computed(() =>
  ['owner', 'admin'].includes(currentSite.value?.currentUserRole ?? ''),
)
const currentSiteIsOwned = computed(() => currentSite.value?.owned === true)
const isSiteAiEnabled = computed(() => currentSite.value?.attributes?.ai?.chatEnabled === true)
const id = computed<string | undefined>(() => {
  if (route.params.folderId == null) return undefined
  return Array.isArray(route.params.folderId) ? route.params.folderId[0] : route.params.folderId
})
const requestedTab = computed(() => {
  const rawPathTab = Array.isArray(route.params.siteTab) ? route.params.siteTab[0] : route.params.siteTab
  if (rawPathTab) return String(rawPathTab)
  const rawTab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
  return rawTab ? String(rawTab) : 'content'
})
const requestedSettingsTab = computed(() => {
  const rawSettingsTab = Array.isArray(route.params.siteSettingsTab)
    ? route.params.siteSettingsTab[0]
    : route.params.siteSettingsTab
  return rawSettingsTab ? String(rawSettingsTab) : null
})
const tabs = computed(() => {
  const query = { ...route.query }
  delete query.tab
  return [
    {
      title: 'Content',
      key: 'content' as const,
      prependIcon: 'fa-file-lines',
      to: id.value
        ? {
            name: 'site-folder-tab',
            params: { siteId: siteId.value, folderId: id.value, siteTab: 'content' },
            query,
          }
        : { name: 'site-tab', params: { siteId: siteId.value, siteTab: 'content' }, query },
    },
    ...(isSiteAiEnabled.value
      ? [
          {
            title: 'AI',
            key: 'ai' as const,
            prependIcon: 'fa-wand-magic-sparkles',
            to: id.value
              ? {
                  name: 'site-folder-tab',
                  params: { siteId: siteId.value, folderId: id.value, siteTab: 'ai' },
                  query,
                }
              : { name: 'site-tab', params: { siteId: siteId.value, siteTab: 'ai' }, query },
          },
        ]
      : []),
    ...(canManageSiteUsers.value
      ? [
          {
            title: 'Users',
            key: 'users' as const,
            prependIcon: 'fa-users',
            to: id.value
              ? {
                  name: 'site-folder-tab',
                  params: { siteId: siteId.value, folderId: id.value, siteTab: 'users' },
                  query,
                }
              : { name: 'site-tab', params: { siteId: siteId.value, siteTab: 'users' }, query },
          },
        ]
      : []),
    ...(canManageSiteSettings.value
      ? [
          {
            title: 'Settings',
            key: 'settings' as const,
            prependIcon: 'fa-gear',
            to: id.value
              ? {
                  name: 'site-folder-tab',
                  params: { siteId: siteId.value, folderId: id.value, siteTab: 'settings' },
                  query,
                }
              : { name: 'site-tab', params: { siteId: siteId.value, siteTab: 'settings' }, query },
          },
        ]
      : []),
  ]
})
async function refreshSiteRouteContext() {
  loading.value = true
  siteLoadError.value = null
  try {
    await siteStore.getSitesIfRequired()
    await siteStore.setCurrentSite(siteId.value)
    contentStore.activeFolderId = id.value
  } catch (error) {
    const missing = error instanceof FetchPrivateError && [403, 404].includes(error.status)
    siteLoadError.value = { missing, message: errorMessage(error, 'This site could not be loaded.') }
    return false
  } finally {
    loading.value = false
  }
  // The Users tab shows its own load error; a failure here must not break the page.
  if (canManageSiteUsers.value) await userStore.getSiteUsers(siteId.value).catch(() => undefined)
  return true
}
async function loadRoute() {
  if (!(await refreshSiteRouteContext())) return
  const matchedTab = tabs.value.find(tab => tab.key === requestedTab.value)
  if (matchedTab) {
    contentStore.activeTab = matchedTab.key
    return
  }
  void router.replace({
    name: 'site-tab',
    params: { siteId: siteId.value, siteTab: 'content' },
    query: route.query,
  })
}
watch([siteId, id, requestedTab], loadRoute, { immediate: true })
</script>

<template>
  <div
    class="site-view"
    :class="{
      'table-active': contentStore.activeTab === 'content' && !preferences.tileView,
      'tiles-active': contentStore.activeTab === 'content' && preferences.tileView,
      'settings-active': contentStore.activeTab === 'settings',
    }"
  >
    <template v-if="siteLoadError">
      <PageHeader title="Site not available" />
      <EmptyState
        v-if="siteLoadError.missing"
        icon="fas fa-folder-open"
        title="This site is not available"
        text="It may have been deleted, or you no longer have access to it."
      >
        <template #actions>
          <BaseButton text="Back to sites" intent="primary" :to="{ name: 'sites' }" />
        </template>
      </EmptyState>
      <LoadError v-else :message="siteLoadError.message" @retry="loadRoute" />
    </template>
    <template v-else>
      <PageHeader :title="currentSite?.name ?? 'Site'" />
      <div class="site-overview">
        <div class="content-title-row site-breadcrumbs-row">
          <Breadcrumbs
            :site-id="siteId"
            :trail="contentStore.folderAncestors"
            :loading="loading"
            :icon="currentSite?.icon ? `fas ${currentSite.icon}` : undefined"
            :avatar="currentSite?.attributes?.media?.icon?.dataUrl"
          />
          <div class="site-tags">
            <Tag
              :color="currentSite?.visibility === 'public' ? 'success' : 'secondary'"
              :text="currentSite?.visibility === 'public' ? 'Public' : 'Private'"
            />
            <Tag :text="currentSiteIsOwned ? 'Owned' : 'Shared'" />
            <Tag v-for="tag in currentSite?.tags" :key="tag" :text="tag" size="small" />
          </div>
        </div>
      </div>
      <div class="content-header site-header">
        <BaseTabs v-model="contentStore.activeTab" :tabs="tabs" />
        <ContentActions
          v-if="contentStore.activeTab === 'content'"
          :id="id"
          v-model:selected="selected"
          :site-id="siteId"
        />
        <UserActions v-if="contentStore.activeTab === 'users'" :site-id="siteId" />
      </div>
      <UploadStatus class="site-upload-status" :always-display="false" :show-text="false" :height="8" />
      <div class="site-body">
        <div v-if="contentStore.activeTab === 'content' && !preferences.tileView" class="site-pane">
          <ContentList :id="id" v-model:selected="selected" :site-id="siteId" />
        </div>
        <div v-if="contentStore.activeTab === 'content' && preferences.tileView" class="site-pane">
          <div class="site-tiles-shell page-bleed">
            <ContentTiles :id="id" v-model:selected="selected" :site-id="siteId" />
          </div>
        </div>
        <User v-if="contentStore.activeTab === 'users'" :site-id="siteId" />
        <div v-if="contentStore.activeTab === 'settings' && canManageSiteSettings" class="site-pane">
          <Settings :site-id="siteId" :requested-tab="requestedSettingsTab" />
        </div>
        <div v-if="contentStore.activeTab === 'ai' && isSiteAiEnabled" class="site-pane">
          <SiteChat :site-id="siteId" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.site-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.site-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.site-breadcrumbs-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.site-overview {
  padding: 8px 0;
  margin-bottom: 10px;
}

.site-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin: 0 8px 0 0;
  flex: 0 1 auto;
}

.site-header {
  padding-right: 0;
}

.site-upload-status {
  margin-top: 6px;
}

.site-view.table-active .site-body {
  overflow: hidden;
}

.site-view:not(.table-active) .site-body {
  overflow: auto;
}

.site-view.settings-active .site-body {
  overflow: hidden;
}

.site-view.settings-active {
  overflow: hidden;
}

.site-view.tiles-active .site-body,
.site-view.tiles-active,
.site-view.tiles-active .site-pane,
.site-view.tiles-active .site-tiles-shell {
  overflow: visible;
}

.site-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.site-tiles-shell {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.site-view.tiles-active :deep(.content-tiles) {
  margin-left: 0;
  margin-right: 0;
}

@media (max-width: 960px) {
  .site-tags {
    margin-right: 0;
    justify-content: flex-start;
  }
}
</style>
