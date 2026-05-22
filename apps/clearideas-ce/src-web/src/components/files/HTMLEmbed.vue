<script setup lang="ts">
import MarkdownRenderer from '../base/MarkdownRenderer.vue'
import { onMounted, ref, watch } from 'vue'
import { useContentTypes } from '../../composables/useContentTypes'
import { useContentStore } from '../../stores'

interface Props { id: string; siteId: string; contentType: string; name: string }
const props = defineProps<Props>()
const contentStore = useContentStore()
const { MarkupContentTypes } = useContentTypes()
const content = ref('')

async function loadContent() {
  if (!MarkupContentTypes.includes(props.contentType)) return
  const payload = await contentStore.getFileBlob()
  content.value = new TextDecoder().decode(payload.data)
}

onMounted(loadContent)
watch(() => [props.id, props.contentType], loadContent)
</script>

<template>
  <div class="html-embed">
    <iframe v-if="props.contentType === 'text/html' || props.contentType === 'application/xhtml+xml'" sandbox class="html-embed-frame" :srcdoc="content" />
    <MarkdownRenderer v-else class="html-embed-renderer" :content="content" />
  </div>
</template>

<style scoped>
.html-embed {
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
}

.html-embed-frame,
.html-embed-renderer {
  flex: 1;
  min-height: 0;
  overflow: auto;
  width: 100%;
  border: 0;
  margin: 0;
}
</style>
