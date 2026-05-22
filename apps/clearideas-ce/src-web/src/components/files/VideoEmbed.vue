<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useContentStore } from '../../stores'

interface Props { id: string; siteId: string; contentType: string; name: string }
const props = defineProps<Props>()
const contentStore = useContentStore()
const link = ref('')
let objectUrl: string | null = null

async function loadContent() {
  if (!props.contentType.startsWith('video/')) return
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
  <div class="file-fixed-container">
    <div class="file-fixed-item">
      <video controls preload="metadata" :src="link" :type="props.contentType" />
    </div>
  </div>
</template>
