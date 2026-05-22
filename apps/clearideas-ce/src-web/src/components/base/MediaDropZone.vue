<script setup lang="ts">
import { useDropZone, useFileDialog } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

interface Media { bucket?: string; dataUrl?: string }
interface Props {
  modelValue?: string
  text?: string
  showAsImage?: boolean
  disabled?: boolean
  disableOnClick?: boolean
  disableOnDrop?: boolean
  prependIcon?: string
  height?: number
  width?: number
  maxFileSizeBytes?: number
  mediaType: string
  uploadFunction?: (files: File[] | FileList, mediaType: string, onProgress: (progress: number | undefined) => void) => Promise<void>
  removeFunction?: (mediaType: string) => Promise<void>
  imageUrlObject?: Record<string, Media | null>
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  text: '',
  disabled: false,
  disableOnClick: false,
  disableOnDrop: false,
  showAsImage: false,
  mediaType: 'icon',
  height: 180,
  width: 180,
  maxFileSizeBytes: 5 * 1024 * 1024,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const isActive = ref(false)
const uploadProgress = ref<number | undefined>(0)
const timestamp = ref(Date.now())
const isUploading = ref(false)
const isDeleting = ref(false)
const isLocalMode = computed(() => !props.uploadFunction && !props.removeFunction)

function withCacheBust(src: string) {
  if (src.startsWith('data:')) return src
  return `${src}${src.includes('?') ? '&' : '?'}${timestamp.value}`
}

const imageUrl = computed(() => {
  if (isLocalMode.value) return props.modelValue || undefined
  const media = props.imageUrlObject?.[props.mediaType]
  if (media?.dataUrl) return withCacheBust(media.dataUrl)
  if (media?.bucket) return withCacheBust(media.bucket)
  return undefined
})

const buttonText = computed(() => props.text || 'Upload')
const uploadOrDropText = computed(() => props.text || `Upload or drop ${props.mediaType} here`)
const { open, onChange, reset } = useFileDialog({ accept: 'image/png,image/gif,image/jpeg,image/jpg,image/webp,image/svg+xml', multiple: false })
const allowedTypes = ['image/png', 'image/gif', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']

function validateFileType(file: File) {
  return allowedTypes.includes(file.type) || !!file.name.toLowerCase().match(/\.(png|gif|jpg|jpeg|webp|svg)$/)
}
function validateFileSize(file: File) { return file.size <= props.maxFileSizeBytes }
async function readFile(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = dataUrl
  })
}
async function normalizeImage(file: File) {
  const originalDataUrl = await readFile(file)
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) return originalDataUrl
  const image = await loadImage(originalDataUrl)
  const maxWidth = 1600
  const maxHeight = 600
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height)
  const targetWidth = Math.max(1, Math.round(image.width * scale))
  const targetHeight = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return originalDataUrl
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight)
  return canvas.toDataURL('image/png')
}
async function upload(files: File[] | FileList) {
  const validFiles = Array.from(files).filter(file => validateFileType(file) && validateFileSize(file))
  if (validFiles.length === 0) return
  isUploading.value = true
  try {
    if (!props.uploadFunction) {
      emit('update:modelValue', await normalizeImage(validFiles[0]))
      return
    }
    await props.uploadFunction(validFiles, props.mediaType, progress => {
      uploadProgress.value = progress
      if (progress === 100) {
        setTimeout(() => (uploadProgress.value = 0), 3000)
        setTimeout(() => { timestamp.value = Date.now() }, 3000)
      }
    })
  } finally {
    isUploading.value = false
    if (typeof reset === 'function') reset()
  }
}
async function onDrop(files: File[] | null) { if (files && !props.disableOnDrop && !props.disabled) await upload(files) }
const dropZoneRef1 = ref()
const dropZoneRef3 = ref()
const dz1 = useDropZone(dropZoneRef1)
watch(dz1.isOverDropZone, over => { if (!props.disableOnDrop) isActive.value = over })
const dz3 = useDropZone(dropZoneRef3)
watch(dz3.isOverDropZone, over => { if (!props.disableOnDrop) isActive.value = over })
onChange(async selectedFiles => { if (selectedFiles) await upload(selectedFiles) })
useDropZone(dropZoneRef1, onDrop)
useDropZone(dropZoneRef3, onDrop)
async function removeMedia() {
  isDeleting.value = true
  try {
    if (!props.removeFunction) emit('update:modelValue', '')
    else {
      await props.removeFunction(props.mediaType)
      setTimeout(() => { timestamp.value = Date.now() }, 3000)
    }
  } finally {
    isDeleting.value = false
    if (typeof reset === 'function') reset()
  }
}
</script>

<template>
  <VBtn
    v-if="!props.showAsImage"
    ref="dropZoneRef1"
    :prepend-icon="props.prependIcon || 'fasl fa-upload'"
    variant="text"
    color="primary"
    :text="buttonText"
    density="comfortable"
    slim
    class="drop-zone px-4"
    :class="isActive ? 'active' : ''"
    :disabled="props.disabled || isUploading"
    @click="() => !props.disabled && open()"
  >
    <template v-if="isUploading" #prepend><VProgressCircular size="16" width="2" indeterminate color="primary" /></template>
  </VBtn>
  <div
    v-else
    class="drop-zone__wrapper"
    :style="{ width: isLocalMode ? '100%' : `${props.width}px`, minWidth: isLocalMode ? '100%' : `${props.width}px`, maxWidth: isLocalMode ? '100%' : `${props.width}px`, flex: isLocalMode ? '1 1 auto' : `0 0 ${props.width}px` }"
  >
    <VCard
      ref="dropZoneRef3"
      style="border: solid 1px rgba(var(--v-border-color), var(--v-border-opacity)); box-shadow: none; border-radius: var(--ci-border-radius); position: relative; width: 100%;"
      :height="props.height"
      class="pa-4 drop-zone d-flex flex-column"
      :class="{ active: isActive }"
      @click="() => !props.disabled && !isUploading && open()"
    >
      <div v-if="imageUrl != null" class="h-100 w-100 d-flex align-center justify-center">
        <VImg :src="imageUrl" class="drop-zone ma-auto" alt="Uploaded media" />
        <VBtn icon color="secondary" size="small" class="top-right-button" density="comfortable" :disabled="props.disabled || isDeleting" @click.stop="removeMedia">
          <VProgressCircular v-if="isDeleting" size="16" width="2" indeterminate color="secondary" />
          <VIcon v-else>fasl fa-xmark</VIcon>
        </VBtn>
      </div>
      <div v-else class="drop-zone__content">
        <div v-if="isUploading" class="drop-zone__state"><VProgressCircular size="48" width="4" indeterminate color="primary" /><div class="text-body-2">Uploading</div></div>
        <div v-else class="drop-zone__state drop-zone__prompt"><VIcon size="x-large" color="primary" :icon="props.prependIcon ?? 'fasl fa-upload'" /><div>{{ uploadOrDropText }}</div></div>
      </div>
    </VCard>
  </div>
</template>

<style scoped>
.drop-zone.active { background-image: repeating-linear-gradient(-45deg, rgba(var(--v-theme-success), 0.5), rgba(var(--v-theme-success), 0.5) 8px, transparent 8px, transparent 16px); }
.top-right-button { position: absolute; top: 4px; right: 4px; background-color: white; }
.drop-zone__wrapper { display: block; }
.drop-zone__content { flex: 1 1 auto; width: 100%; display: flex; align-items: center; justify-content: center; }
.drop-zone__state { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.drop-zone__prompt { gap: 8px; color: rgb(var(--v-theme-on-surface)); }
</style>
