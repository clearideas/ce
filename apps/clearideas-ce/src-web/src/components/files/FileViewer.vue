<script setup lang="ts">
import { computed } from 'vue'
import { useContentTypes } from '../../composables/useContentTypes'
import { useContentStore, useSiteStore } from '../../stores'
import DownloadIcon from '../content/actions/DownloadIcon.vue'
import AudioEmbed from './AudioEmbed.vue'
import CodeEmbed from './CodeEmbed.vue'
import HTMLEmbed from './HTMLEmbed.vue'
import ImageEmbed from './ImageEmbed.vue'
import PDFEmbed from './PDFEmbed.vue'
import VideoEmbed from './VideoEmbed.vue'

interface Props {
  id: string
  siteId: string
  loading: boolean
  initialPage?: number
}
const props = defineProps<Props>()
const contentStore = useContentStore()
const siteStore = useSiteStore()
const { MarkupContentTypes, CodeContentTypes, PDFContentTypes, ImageContentTypes, VideoContentTypes, AudioContentTypes, ViewerContentTypes } = useContentTypes()
const canDownload = computed(() => contentStore.file?.kind === 'file' && siteStore.currentSite?.currentUserRole !== 'viewer')
const contentType = computed(() => contentStore.file?.contentType || inferContentTypeFromName(contentStore.file?.name ?? ''))

function inferContentTypeFromName(name: string) {
  const extension = name.toLowerCase().split('.').pop()
  switch (extension) {
    case 'json':
      return 'application/json'
    case 'md':
    case 'markdown':
      return 'text/markdown'
    case 'txt':
    case 'log':
      return 'text/plain'
    case 'csv':
      return 'text/csv'
    case 'xml':
      return 'application/xml'
    case 'yaml':
    case 'yml':
      return 'application/yaml'
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'text/javascript'
    case 'css':
      return 'text/css'
    case 'html':
    case 'htm':
      return 'text/html'
    default:
      return ''
  }
}
</script>

<template>
  <div class="file-viewer">
    <div v-if="props.loading" class="viewer-loading d-flex justify-center align-center">
      <VProgressCircular indeterminate color="primary" size="100" width="8" />
    </div>
    <PDFEmbed v-if="PDFContentTypes.includes(contentType)" class="viewer-pane" :id="props.id" :site-id="props.siteId" :content-type="contentType" :name="contentStore.file?.name || ''" :initial-page="props.initialPage" />
    <ImageEmbed v-if="ImageContentTypes.includes(contentType)" class="viewer-pane" :id="props.id" :site-id="props.siteId" :content-type="contentType" :name="contentStore.file?.name || ''" />
    <VideoEmbed v-if="VideoContentTypes.includes(contentType)" class="viewer-pane" :id="props.id" :site-id="props.siteId" :content-type="contentType" :name="contentStore.file?.name || ''" />
    <AudioEmbed v-if="AudioContentTypes.includes(contentType)" class="viewer-pane" :id="props.id" :site-id="props.siteId" :content-type="contentType" :name="contentStore.file?.name || ''" />
    <HTMLEmbed v-if="MarkupContentTypes.includes(contentType)" class="viewer-pane" :id="props.id" :site-id="props.siteId" :content-type="contentType" :name="contentStore.file?.name || ''" />
    <CodeEmbed v-if="CodeContentTypes.includes(contentType) && !MarkupContentTypes.includes(contentType)" class="viewer-pane" :id="props.id" :site-id="props.siteId" :content-type="contentType" :name="contentStore.file?.name || ''" />
    <VEmptyState v-if="!props.loading && !ViewerContentTypes().includes(contentType)" class="viewer-pane" title="No viewer available">
      <template #text>
        <p class="text-medium-emphasis">This file type cannot be previewed in the browser.<span v-if="canDownload"> Download it to view locally.</span></p>
      </template>
      <template #media><VIcon color="info">fass fa-files</VIcon></template>
      <template #actions>
        <DownloadIcon
          v-if="canDownload"
          :id="contentStore.file?.id ?? ''"
          :site-id="contentStore.file?.site ?? props.siteId"
          kind="file"
          show-as-button
          variant="flat"
          color="info"
          size="large"
          text="Download"
        />
      </template>
    </VEmptyState>
  </div>
</template>

<style scoped>
.file-viewer { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: visible; margin-top: var(--content-header-body-gap); }
.viewer-loading { height: 100%; }
.viewer-pane { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: visible; }
</style>
