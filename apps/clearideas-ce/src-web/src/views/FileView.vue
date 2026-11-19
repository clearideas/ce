<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseTabs from '../components/base/BaseTabs.vue'
import FileActions from '../components/files/actions/FileActions.vue'
import FileViewer from '../components/files/FileViewer.vue'
import Properties from '../components/files/Properties.vue'
import Breadcrumbs from '../components/sites/Breadcrumbs.vue'
import { useContentStore, useSiteStore } from '../stores'
import PageHeader from '../components/base/PageHeader.vue'
import BaseButton from '../components/base/BaseButton.vue'
import EmptyState from '../components/base/EmptyState.vue'
import LoadError from '../components/base/LoadError.vue'
import { FetchPrivateError } from '../api/fetchPrivate'
import { errorMessage } from '../utils/errors'

const contentStore = useContentStore()
const siteStore = useSiteStore()
const route = useRoute()
const router = useRouter()
const tab = ref('file')
const loadingFile = ref(false)
/**
 * The file (or its site) could not be opened: `missing` (404/403 — deleted, moved, or no longer
 * shared) shows a "not available" state with a way back; other failures a retryable error.
 */
const loadError = ref<{ missing: boolean; message: string } | null>(null)

const siteId = computed(() =>
  Array.isArray(route.params.siteId) ? route.params.siteId[0] : String(route.params.siteId ?? ''),
)
const id = computed(() =>
  Array.isArray(route.params.fileId) ? route.params.fileId[0] : String(route.params.fileId ?? ''),
)
const requestedTab = computed(() => {
  const raw = Array.isArray(route.params.fileTab) ? route.params.fileTab[0] : route.params.fileTab
  return raw === 'properties' ? 'properties' : 'file'
})
const initialPage = computed<number | undefined>(() => {
  const rawPage = Array.isArray(route.query.page) ? route.query.page[0] : route.query.page
  if (rawPage == null) return undefined
  const parsed = Number.parseInt(String(rawPage), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
})
const loading = computed(() => !!(siteStore.loadingSites || loadingFile.value || contentStore.loading))
const userTabs = computed(() => [
  { title: 'File', key: 'file', to: { name: 'file', params: { siteId: siteId.value, fileId: id.value } } },
  {
    title: 'Properties',
    key: 'properties',
    to: { name: 'file', params: { siteId: siteId.value, fileId: id.value, fileTab: 'properties' } },
  },
])

async function loadFile() {
  if (!siteId.value || !id.value) return
  loadingFile.value = true
  loadError.value = null
  try {
    contentStore.file = null
    await siteStore.getSitesIfRequired()
    await siteStore.setCurrentSite(siteId.value)
    await contentStore.getFile(siteId.value, id.value)
  } catch (error) {
    const missing = error instanceof FetchPrivateError && [403, 404].includes(error.status)
    loadError.value = { missing, message: errorMessage(error, 'This file could not be loaded.') }
  } finally {
    loadingFile.value = false
  }
}

watch([siteId, id], loadFile, { immediate: true })
watch(
  requestedTab,
  value => {
    tab.value = value
  },
  { immediate: true },
)
watch(tab, nextTab => {
  const nextFileTab = nextTab === 'file' ? undefined : nextTab
  const current = Array.isArray(route.params.fileTab) ? route.params.fileTab[0] : route.params.fileTab
  if ((current || undefined) === nextFileTab) return
  void router.replace({
    name: 'file',
    params: { siteId: siteId.value, fileId: id.value, fileTab: nextFileTab },
  })
})
onMounted(() => {
  tab.value = requestedTab.value
})
</script>

<template>
  <template v-if="loadError">
    <PageHeader title="File not available" />
    <EmptyState
      v-if="loadError.missing"
      icon="fas fa-file-circle-xmark"
      title="This file is not available"
      text="It may have been deleted or moved, or you no longer have access to it."
    >
      <template #actions>
        <BaseButton
          :text="siteStore.currentSite ? `Back to ${siteStore.currentSite.name}` : 'Back to sites'"
          intent="primary"
          :to="siteStore.currentSite ? { name: 'site', params: { siteId } } : { name: 'sites' }"
        />
      </template>
    </EmptyState>
    <LoadError v-else :message="loadError.message" @retry="loadFile" />
  </template>
  <template v-else>
    <div
      class="file-view"
      :class="{
        'viewer-active': tab === 'file',
        'properties-active': tab === 'properties',
      }"
    >
      <PageHeader :title="contentStore.file?.name ?? 'File'" />
      <div class="content-title-row file-breadcrumbs-row">
        <Breadcrumbs
          :icon="!!siteStore.currentSite?.icon ? `fas ${siteStore.currentSite.icon}` : undefined"
          :avatar="siteStore.currentSite?.attributes?.media?.icon?.dataUrl"
          :loading="loading"
          :site-id="siteId"
        />
      </div>
      <div class="content-header">
        <BaseTabs v-model="tab" :tabs="userTabs" />
        <FileActions :id="id" :site-id="siteId" :tab="tab" />
      </div>
      <div class="file-content-shell page-bleed">
        <div class="file-tab-content">
          <FileViewer
            v-if="tab === 'file'"
            :id="id"
            :site-id="siteId"
            :loading="loading"
            :initial-page="initialPage"
          />
          <div v-if="tab === 'properties'" class="properties-tab-viewport">
            <div class="properties-tab-pane page-bleed"><Properties /></div>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.file-view {
  display: flex;
  flex-direction: column;

  --ci-page-bleed: 24px;
}

.file-content-shell {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  overflow: visible;
}

.file-view.viewer-active {
  flex: 1;
  min-height: 0;
  overflow: visible;
}

.file-view.properties-active {
  flex: 1;
  min-height: 0;
  overflow: visible;
}

.file-tab-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.file-breadcrumbs-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.file-view.viewer-active .file-tab-content {
  flex: 1;
  min-height: 0;
  overflow: visible;
}

.file-view.properties-active .file-tab-content {
  flex: 1;
  min-height: 0;
  overflow: visible;
}

.properties-tab-viewport {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: clip;
  overflow-clip-margin: var(--ci-page-bleed);
}

.properties-tab-pane {
  min-height: fit-content;
  display: flex;
  flex-direction: column;
  margin-top: var(--content-header-body-gap);
  gap: 16px;
  overflow: visible;
  padding-bottom: 8px;
  box-sizing: border-box;
}

.properties-tab-pane > * {
  margin: 0;
}
</style>
