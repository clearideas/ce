<script setup lang="ts">
import hljs from 'highlight.js'
import { nextTick, onMounted, ref, watch } from 'vue'
import { useContentTypes } from '../../composables/useContentTypes'
import { useContentStore } from '../../stores'

interface Props { id: string; siteId: string; contentType: string; name: string }
const props = defineProps<Props>()
const loading = ref(false)
const contentStore = useContentStore()
const code = ref('')
const highlightedCode = ref<HTMLElement | null>(null)
const languageClass = ref('plaintext')
const { CodeContentTypes } = useContentTypes()

function setLanguageClass(contentType: string) {
  const subtype = contentType.split('/')[1] || 'plaintext'
  languageClass.value = subtype.includes('json') ? 'json' : subtype.includes('javascript') ? 'javascript' : subtype.includes('xml') ? 'xml' : subtype.includes('css') ? 'css' : 'plaintext'
}

function highlightCode() {
  if (!highlightedCode.value) return
  highlightedCode.value.removeAttribute('data-highlighted')
  if (props.contentType === 'application/json') {
    try { code.value = JSON.stringify(JSON.parse(code.value), null, 2) } catch {}
  }
  highlightedCode.value.textContent = code.value
  hljs.highlightElement(highlightedCode.value)
}

async function loadContent() {
  loading.value = true
  try {
    if (!CodeContentTypes.includes(props.contentType)) return
    const payload = await contentStore.getFileBlob()
    code.value = new TextDecoder().decode(payload.data)
    setLanguageClass(props.contentType)
    loading.value = false
    await nextTick()
    highlightCode()
  } finally {
    loading.value = false
  }
}

onMounted(loadContent)
watch(() => [props.id, props.contentType], loadContent)
watch(code, async () => {
  await nextTick()
  highlightCode()
})
</script>

<template>
  <div class="code-embed pa-4">
    <div v-if="loading" class="code-embed-loading d-flex justify-center align-center">
      <VProgressCircular indeterminate color="primary" size="100" width="8" />
    </div>
    <pre v-if="!loading && CodeContentTypes.includes(props.contentType)" class="code-embed-pre"><code ref="highlightedCode" :class="languageClass" /></pre>
    <VEmptyState v-if="!loading && !CodeContentTypes.includes(props.contentType)" title="Unsupported file type">
      <template #text><p class="text-medium-emphasis">This file type cannot be displayed as text.</p></template>
      <template #media><VIcon color="info" icon="fasl fa-file-code" /></template>
    </VEmptyState>
  </div>
</template>

<style scoped>
.code-embed {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--ci-surface);
  color: var(--ci-on-surface);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.06);
  box-sizing: border-box;
}

.code-embed-loading {
  height: 100%;
}

.code-embed-pre {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 0;
}
</style>
