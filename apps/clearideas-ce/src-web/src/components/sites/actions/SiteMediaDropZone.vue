<script setup lang="ts">
import MediaDropZone from '../../base/MediaDropZone.vue'
import { useSiteStore } from '../../../stores'

interface Props {
  siteId: string
  mediaType?: string
  text?: string
  showAsImage?: boolean
  disabled?: boolean
  height?: number
  width?: number
}

const props = withDefaults(defineProps<Props>(), {
  mediaType: 'icon',
  showAsImage: true,
  disabled: false,
  text: undefined,
  height: 180,
  width: 180,
})

const siteStore = useSiteStore()

async function readFile(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function siteUploadFunction(
  files: File[] | FileList,
  mediaType: string,
  onProgress: (progress: number | undefined) => void,
) {
  const firstFile = Array.from(files)[0]
  if (!firstFile) return
  onProgress(10)
  const dataUrl = await readFile(firstFile)
  onProgress(80)
  await siteStore.updateSiteMedia(mediaType, dataUrl)
  onProgress(100)
}
</script>

<template>
  <MediaDropZone
    v-if="siteStore.currentSite"
    :upload-function="siteUploadFunction"
    :remove-function="siteStore.deleteMedia"
    :image-url-object="siteStore.currentSite?.attributes?.media"
    :media-type="props.mediaType"
    show-as-image
    :disabled="props.disabled"
    :text="props.text || `Upload or drop ${props.mediaType} here`"
    :height="props.height"
    :width="props.width"
  />
</template>
