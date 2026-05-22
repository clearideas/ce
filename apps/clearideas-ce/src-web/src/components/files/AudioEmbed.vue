<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useContentStore } from '../../stores'

interface Props { id: string; siteId: string; contentType: string; name: string }
const props = defineProps<Props>()
const contentStore = useContentStore()
const link = ref('')
let objectUrl: string | null = null

async function loadContent() {
  if (!props.contentType.startsWith('audio/')) return
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  const payload = await contentStore.getFileBlob()
  objectUrl = URL.createObjectURL(payload.blob)
  link.value = objectUrl
}

onMounted(loadContent)
watch(() => [props.id, props.contentType], loadContent)
onUnmounted(() => { if (objectUrl) URL.revokeObjectURL(objectUrl) })
</script>

<template>
  <div class="audio-embed pa-4">
    <audio controls preload="metadata" :src="link" :type="props.contentType" playsinline class="w-100" />
  </div>
</template>

<style scoped>
.audio-embed {
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: flex-start;
  background: var(--ci-surface);
  color: var(--ci-on-surface);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.06);
  box-sizing: border-box;
  overflow: hidden;
}
</style>
