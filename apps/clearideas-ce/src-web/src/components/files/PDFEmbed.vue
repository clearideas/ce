<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useContentTypes } from '../../composables/useContentTypes'
import { useContentStore, useSiteStore } from '../../stores'
import BasePDFViewer from './BasePDFViewer.vue'

interface Props { id: string; siteId: string; contentType: string; name: string; initialPage?: number }
const props = defineProps<Props>()
const contentStore = useContentStore()
const siteStore = useSiteStore()
const { PDFContentTypes } = useContentTypes()
const pdfData = ref<Uint8Array | null>(null)
const resolving = ref(false)
const isPDF = computed(() => PDFContentTypes.includes(props.contentType))
const printAllowed = computed(() => {
  const pdf = siteStore.currentSite?.attributes?.pdf
  const currentRole = siteStore.currentSite?.currentUserRole
  if (!pdf?.printEnabled || !currentRole) return false
  return (pdf.printRoles?.length ?? 0) === 0 || Boolean(pdf.printRoles?.includes(currentRole))
})

async function loadPdfUrl() {
  if (!isPDF.value) { pdfData.value = null; return }
  resolving.value = true
  try {
    const payload = await contentStore.getFileBlob()
    pdfData.value = payload.data
  } finally {
    resolving.value = false
  }
}

onMounted(loadPdfUrl)
watch(() => [props.id, props.siteId, props.contentType], loadPdfUrl)
</script>

<template>
  <div class="pdf-embed">
    <div v-if="resolving && !pdfData" class="pdf-embed__loading">
      <VProgressCircular indeterminate color="primary" size="100" width="8" />
    </div>
    <BasePDFViewer
      v-else-if="pdfData"
      class="pdf-embed__viewer"
      :border-width="0"
      border-radius="6px"
      :pdf-data="pdfData"
      :initial-page="props.initialPage"
      :toolbar-bottom-inset="60"
      rotate-enabled
      :print-enabled="printAllowed"
      loading-label="Loading PDF"
      no-pages-label="No renderable pages"
      failed-load-label="Failed to load PDF"
      failed-render-label="Failed to render page"
    />
  </div>
</template>

<style scoped>
.pdf-embed {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--ci-surface);
  color: var(--ci-on-surface);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.06);
}

.pdf-embed__loading {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pdf-embed__viewer {
  flex: 1;
  min-height: 0;
}
</style>
