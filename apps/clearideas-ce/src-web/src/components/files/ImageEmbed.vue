<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useContentTypes } from '../../composables/useContentTypes'
import { useContentStore } from '../../stores'

interface Props { id: string; siteId: string; contentType: string; name: string }
const props = defineProps<Props>()
const { ImageContentTypes } = useContentTypes()
const contentStore = useContentStore()
const link = ref('')
let objectUrl: string | null = null

async function loadContent() {
  if (!ImageContentTypes.includes(props.contentType)) return
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
  <div class="file-fixed-container image-embed__container">
    <div class="file-fixed-item image-embed__item">
      <VImg v-if="link" :src="link" class="image-embed__image" />
    </div>
  </div>
</template>

<style scoped>
.image-embed__container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.image-embed__item {
  position: relative;
  inset: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.image-embed__image {
  width: 100%;
  height: 100%;
}

.image-embed__image :deep(.v-responsive__content) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-embed__image :deep(img) {
  object-fit: contain;
  object-position: center center;
}
</style>
