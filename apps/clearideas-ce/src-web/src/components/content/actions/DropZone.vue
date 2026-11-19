<script setup lang="ts">
import type { UseDropZoneOptions } from '@vueuse/core'
import { useDropZone, useFileDialog } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, useAttrs, watch } from 'vue'
import { useContentStore } from '../../../stores'
import BaseButton from '../../base/BaseButton.vue'
import ContentListItem from '../ContentListItem.vue'
import { ICONS } from '../../../icons'
import type { ButtonIntent } from '../../../types/ui'

interface Props {
  siteId: string
  id?: string
  text?: string
  icon?: string
  color?: string
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  intent?: ButtonIntent
  density?: 'default' | 'comfortable' | 'compact'
  size?: string
  disableOnClick?: boolean
  disableOnDrop?: boolean
  prependIcon?: string
  refreshAfterPost?: boolean
  showAsItem?: boolean
  showAsMenu?: boolean
  dropStyle?: 'upload' | 'folder'
}

const props = withDefaults(defineProps<Props>(), {
  intent: 'primary',
  text: '',
  size: 'default',
  prependIcon: 'fas fa-cloud-arrow-up',
  disableOnClick: false,
  disableOnDrop: false,
  refreshAfterPost: false,
  showAsItem: false,
  showAsMenu: false,
  dropStyle: 'upload',
})

const attrs = useAttrs()
const contentStore = useContentStore()
const isActive = ref(false)
const isDragging = ref(false)
const isUploading = ref(false)
const uploadQueue = ref<Array<File[] | FileList>>([])
const dropZoneRef1 = ref<HTMLElement | null>(null)
const dropZoneRef2 = ref<HTMLElement | null>(null)
const dropZoneRef3 = ref<HTMLElement | null>(null)
const displayText = computed(() => props.text || 'Upload')
const buttonText = computed(() => (props.text === '' && props.icon ? undefined : displayText.value))
const buttonIcon = computed(() => (buttonText.value ? undefined : (props.icon ?? props.prependIcon)))
const buttonPrependIcon = computed(() => (buttonText.value ? props.prependIcon : undefined))
const { open, onChange } = useFileDialog()

function handleClick() {
  if (!isUploading.value && !props.disableOnClick) open()
}

async function processUploadQueue() {
  if (isUploading.value || uploadQueue.value.length === 0) return
  const files = uploadQueue.value.shift()
  if (!files) return
  isUploading.value = true
  try {
    await contentStore.putFiles({
      siteId: props.siteId,
      folderId: props.id,
      files,
      refreshAfterPost: props.refreshAfterPost,
    })
  } finally {
    isUploading.value = false
    void processUploadQueue()
  }
}

async function uploadFiles(files: File[] | FileList) {
  uploadQueue.value.push(files)
  await processUploadQueue()
}

async function onDrop(files: File[] | null) {
  if (files && !props.disableOnDrop) await uploadFiles(files)
}

function onGlobalDragStart(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files')) isDragging.value = true
}

function onGlobalDragStop() {
  isDragging.value = false
}

onMounted(() => {
  window.addEventListener('dragenter', onGlobalDragStart)
  window.addEventListener('dragleave', onGlobalDragStop)
  window.addEventListener('dragover', onGlobalDragStart)
  window.addEventListener('drop', onGlobalDragStop)
})

onUnmounted(() => {
  window.removeEventListener('dragenter', onGlobalDragStart)
  window.removeEventListener('dragleave', onGlobalDragStop)
  window.removeEventListener('dragover', onGlobalDragStart)
  window.removeEventListener('drop', onGlobalDragStop)
})

const options: UseDropZoneOptions = { onDrop }
const dz1 = useDropZone(dropZoneRef1, options)
const dz2 = useDropZone(dropZoneRef2, options)
const dz3 = useDropZone(dropZoneRef3, options)

watch([dz1.isOverDropZone, dz2.isOverDropZone, dz3.isOverDropZone], ([dz1Over, dz2Over, dz3Over]) => {
  if (!props.disableOnDrop) isActive.value = dz1Over || dz2Over || dz3Over
})

onChange(async selectedFiles => {
  if (selectedFiles) await uploadFiles(selectedFiles)
})
</script>

<template>
  <BaseButton
    v-if="!props.showAsItem && !props.showAsMenu"
    v-bind="attrs"
    ref="dropZoneRef1"
    :icon="buttonIcon"
    :prepend-icon="buttonPrependIcon"
    :text="buttonText"
    :variant="props.variant"
    :intent="props.intent"
    :color="props.color"
    :density="props.density"
    :size="props.size"
    :disabled="isUploading"
    tooltip="Upload files"
    aria-label="Upload files"
    class="drop-zone"
    :class="{
      active: isActive,
      dragging: isDragging,
      'drop-zone--folder': props.dropStyle === 'folder',
    }"
    @click="handleClick"
  />
  <VListItem
    v-else-if="props.showAsMenu"
    v-bind="attrs"
    :prepend-icon="ICONS.upload"
    density="compact"
    title="Upload"
    @click="() => open()"
  />
  <ContentListItem
    v-if="props.showAsItem && props.disableOnClick"
    v-bind="attrs"
    ref="dropZoneRef2"
    class="drop-zone rounded-lg"
    :class="{
      active: isActive,
      dragging: isDragging,
      'drop-zone--folder': props.dropStyle === 'folder',
    }"
  >
    <template v-if="$slots.checkbox" #checkbox><slot name="checkbox"></slot></template>
    <template #prepend>
      <VIcon :icon="props.prependIcon || 'fas fa-upload'" />
    </template>
    <template #text>
      <slot name="text">
        {{ displayText }}
      </slot>
    </template>
    <template v-if="$slots.append" #append><slot name="append"></slot></template>
  </ContentListItem>
  <ContentListItem
    v-if="props.showAsItem && !props.disableOnClick"
    v-bind="attrs"
    ref="dropZoneRef3"
    class="drop-zone rounded-lg"
    :class="{
      active: isActive,
      dragging: isDragging,
      'drop-zone--folder': props.dropStyle === 'folder',
    }"
    @click="handleClick"
  >
    <template v-if="$slots.checkbox" #checkbox><slot name="checkbox"></slot></template>
    <template #prepend>
      <VIcon :icon="props.prependIcon || 'fas fa-upload'" />
    </template>
    <template #text>
      <slot name="text">
        {{ displayText }}
      </slot>
    </template>
    <template v-if="$slots.append" #append><slot name="append"></slot></template>
  </ContentListItem>
</template>

<style scoped>
.drop-zone {
  flex-grow: 1;
}

.drop-zone.dragging.active,
.drop-zone.active {
  border: solid 1px rgba(var(--v-theme-success), 0.9);
  background-image: repeating-linear-gradient(
    -45deg,
    rgba(var(--v-theme-success), 0.5),
    rgba(var(--v-theme-success), 0.5) 8px,
    transparent 8px,
    transparent 16px
  );
}

.drop-zone.dragging {
  border: solid 1px rgba(var(--v-theme-success), 0.1);
  background-image: repeating-linear-gradient(
    -45deg,
    rgba(var(--v-theme-success), 0.25),
    rgba(var(--v-theme-success), 0.25) 8px,
    transparent 8px,
    transparent 16px
  );
}

.drop-zone--folder.drop-zone--folder-hover {
  border-radius: 6px;
  border: solid 1px rgba(var(--v-theme-feature), 0.55);
  background: rgba(var(--v-theme-feature), 0.08);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-feature), 0.16);
  background-image: none;
}
</style>
