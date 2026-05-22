<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
import { useContentStore, useProfileStore, useSiteStore, useUserStore } from '../stores'

const siteStore = useSiteStore()
const contentStore = useContentStore()
const profileStore = useProfileStore()
const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const loading = ref(true)
const selected = ref<string[]>([])
const contentSortKey = ref<'rank' | 'name' | 'size' | 'updatedAt'>('rank')
const contentSortOrder = ref<'asc' | 'desc'>('asc')
const contentNameFilterType = ref<'contains' | 'startsWith'>('contains')
const contentNameFilterValue = ref('')
const contentMimeTypes = ref<string[]>([])
const contentSizeOperator = ref<'gt' | 'lt'>('gt')
const contentSizeValue = ref('')
const contentUpdatedOperator = ref<'before' | 'after'>('after')
const contentUpdatedDate = ref('')
const showContentFilters = ref(false)
const contentHeaderRef = ref<HTMLElement | null>(null)
const { currentSite } = storeToRefs(siteStore)
const siteId = computed(() => String(route.params.siteId))
const canManageSiteUsers = computed(() => ['owner', 'admin'].includes(currentSite.value?.currentUserRole ?? ''))
const canManageSiteSettings = computed(() => ['owner', 'admin'].includes(currentSite.value?.currentUserRole ?? ''))
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
      key: 'content',
      prependIcon: 'fa-files',
      to: id.value
        ? { name: 'site-folder-tab', params: { siteId: siteId.value, folderId: id.value, siteTab: 'content' }, query }
        : { name: 'site-tab', params: { siteId: siteId.value, siteTab: 'content' }, query },
    },
    ...(isSiteAiEnabled.value
      ? [
          {
            title: 'AI',
            key: 'ai',
            prependIcon: 'fa-sparkles',
            to: id.value
              ? { name: 'site-folder-tab', params: { siteId: siteId.value, folderId: id.value, siteTab: 'ai' }, query }
              : { name: 'site-tab', params: { siteId: siteId.value, siteTab: 'ai' }, query },
          },
        ]
      : []),
    ...(canManageSiteUsers.value
      ? [
          {
            title: 'Users',
            key: 'users',
            prependIcon: 'fa-users',
            to: id.value
              ? { name: 'site-folder-tab', params: { siteId: siteId.value, folderId: id.value, siteTab: 'users' }, query }
              : { name: 'site-tab', params: { siteId: siteId.value, siteTab: 'users' }, query },
          },
        ]
      : []),
    ...(canManageSiteSettings.value
      ? [
          {
            title: 'Settings',
            key: 'settings',
            prependIcon: 'fa-gear',
            to: id.value
              ? { name: 'site-folder-tab', params: { siteId: siteId.value, folderId: id.value, siteTab: 'settings' }, query }
              : { name: 'site-tab', params: { siteId: siteId.value, siteTab: 'settings' }, query },
          },
        ]
      : []),
  ]
})
async function refreshSiteRouteContext() {
  loading.value = true
  await siteStore.getSitesIfRequired()
  await siteStore.setCurrentSite(siteId.value)
  contentStore.activeFolderId = id.value
  if (canManageSiteUsers.value) await userStore.getUsers(siteId.value)
  loading.value = false
}
function resetContentFilters() {
  contentSortKey.value = 'rank'; contentSortOrder.value = 'asc'; contentNameFilterType.value = 'contains'; contentNameFilterValue.value = ''; contentMimeTypes.value = []; contentSizeOperator.value = 'gt'; contentSizeValue.value = ''; contentUpdatedOperator.value = 'after'; contentUpdatedDate.value = ''
}
watch(
  [siteId, id, requestedTab],
  async () => {
    await refreshSiteRouteContext()
    if (tabs.value.some(tab => tab.key === requestedTab.value)) {
      contentStore.activeTab = requestedTab.value as any
      return
    }
    void router.replace({ name: 'site-tab', params: { siteId: siteId.value, siteTab: 'content' }, query: route.query })
  },
  { immediate: true },
)
onMounted(refreshSiteRouteContext)
</script>

<template>
  <div class="site-view" :class="{ 'table-active': contentStore.activeTab === 'content' && !profileStore.tileView, 'tiles-active': contentStore.activeTab === 'content' && profileStore.tileView, 'settings-active': contentStore.activeTab === 'settings' }">
    <div class="site-overview">
      <div class="content-title-row site-breadcrumbs-row">
        <Breadcrumbs
          :site-id="siteId"
          :loading="loading"
          :icon="currentSite?.icon ? `fasl ${currentSite.icon}` : undefined"
          :avatar="currentSite?.attributes?.media?.icon?.dataUrl"
        />
        <div class="site-tags">
          <Tag :color="currentSite?.visibility === 'public' ? 'success' : 'secondary'" :text="currentSite?.visibility === 'public' ? 'Public' : 'Private'" />
          <Tag :text="currentSiteIsOwned ? 'Owned' : 'Shared'" />
          <Tag v-for="tag in currentSite?.tags" :key="tag" :text="tag" size="small" />
        </div>
      </div>
    </div>
    <div class="content-header site-header" ref="contentHeaderRef">
      <BaseTabs v-model="contentStore.activeTab" :tabs="tabs" />
      <ContentActions
        v-if="contentStore.activeTab === 'content'"
        :site-id="siteId"
        :id="id"
        v-model:selected="selected"
        v-model:show-filters="showContentFilters"
        v-model:sort-key="contentSortKey"
        v-model:sort-order="contentSortOrder"
        v-model:name-filter-type="contentNameFilterType"
        v-model:name-filter-value="contentNameFilterValue"
        v-model:mime-types="contentMimeTypes"
        v-model:size-operator="contentSizeOperator"
        v-model:size-value="contentSizeValue"
        v-model:updated-operator="contentUpdatedOperator"
        v-model:updated-date="contentUpdatedDate"
      />
      <UserActions v-if="contentStore.activeTab === 'users'" :site-id="siteId" />
    </div>
    <UploadStatus class="site-upload-status" :always-display="false" :show-text="false" :height="8" />
    <div class="site-body">
      <div v-if="contentStore.activeTab === 'content' && !profileStore.tileView" class="site-pane">
        <ContentList
          :site-id="siteId"
          :id="id"
          display="default"
          :site-name="siteStore.currentSite?.name ?? ''"
          v-model:selected="selected"
          v-model:sort-key="contentSortKey"
          v-model:sort-order="contentSortOrder"
          v-model:name-filter-type="contentNameFilterType"
          v-model:name-filter-value="contentNameFilterValue"
          v-model:mime-types="contentMimeTypes"
          v-model:size-operator="contentSizeOperator"
          v-model:size-value="contentSizeValue"
          v-model:updated-operator="contentUpdatedOperator"
          v-model:updated-date="contentUpdatedDate"
        />
      </div>
      <div v-if="contentStore.activeTab === 'content' && profileStore.tileView" class="site-pane">
        <div class="site-tiles-shell">
          <ContentTiles
            :site-id="siteId"
            :id="id"
            display="default"
            :site-name="siteStore.currentSite?.name ?? ''"
            v-model:selected="selected"
            v-model:sort-key="contentSortKey"
            v-model:sort-order="contentSortOrder"
            v-model:name-filter-type="contentNameFilterType"
            v-model:name-filter-value="contentNameFilterValue"
            v-model:mime-types="contentMimeTypes"
            v-model:size-operator="contentSizeOperator"
            v-model:size-value="contentSizeValue"
            v-model:updated-operator="contentUpdatedOperator"
            v-model:updated-date="contentUpdatedDate"
          />
        </div>
      </div>
      <User v-if="contentStore.activeTab === 'users'" :site-id="siteId" />
      <div v-if="contentStore.activeTab === 'settings' && canManageSiteSettings" class="site-pane"><Settings :site-id="siteId" :requested-tab="requestedSettingsTab" /></div>
      <div v-if="contentStore.activeTab === 'ai' && isSiteAiEnabled" class="site-pane"><SiteChat :site-id="siteId" /></div>
    </div>
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
  padding: 8px 0 8px;
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
  width: calc(100% + 16px);
  margin-left: -8px;
  margin-right: -8px;
  padding-left: 8px;
  padding-right: 8px;
  box-sizing: border-box;
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
