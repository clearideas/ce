<script setup lang="ts">
import type { UseDropZoneOptions } from '@vueuse/core'
import { useDropZone, useFileDialog } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, useAttrs, watch } from 'vue'
import { useContentStore } from '../../../stores'
import ContentListItem from '../ContentListItem.vue'

interface Props {
  siteId: string
  id?: string
  text?: string
  icon?: string
  color?: string
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  density?: 'default' | 'comfortable' | 'compact'
  size?: string
  disableOnClick?: boolean
  disableOnDrop?: boolean
  prependIcon?: string
  refreshAfterPost?: boolean
  showAsItem?: boolean
  showAsMenu?: boolean
  isSorting?: boolean
  dropStyle?: 'upload' | 'folder'
}

const props = withDefaults(defineProps<Props>(), {
  text: '',
  variant: 'text',
  size: 'default',
  color: 'primary',
  prependIcon: 'fass fa-cloud-upload',
  disableOnClick: false,
  disableOnDrop: false,
  refreshAfterPost: false,
  showAsItem: false,
  showAsMenu: false,
  isSorting: false,
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
  if (files && !props.disableOnDrop && !props.isSorting) await uploadFiles(files)
}

function onGlobalDragStart(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files') && !props.isSorting) isDragging.value = true
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
  if (!props.disableOnDrop && !props.isSorting) isActive.value = dz1Over || dz2Over || dz3Over
})

onChange(async selectedFiles => {
  if (selectedFiles && !props.isSorting) await uploadFiles(selectedFiles)
})
</script>

<template>
  <VBtn
    v-if="!props.showAsItem && !props.showAsMenu"
    v-bind="attrs"
    ref="dropZoneRef1"
    :icon="buttonIcon"
    :prepend-icon="buttonPrependIcon"
    :text="buttonText"
    :variant="props.variant"
    :color="props.color"
    :density="props.density"
    :size="props.size"
    :disabled="isUploading"
    class="drop-zone"
    :class="{
      active: isActive && !props.isSorting,
      dragging: isDragging && !props.isSorting,
      sorting: props.isSorting,
      'drop-zone--folder': props.dropStyle === 'folder',
    }"
    rounded="xl"
    v-tippy="{ content: 'Upload', placement: 'top' }"
    @click="handleClick"
  />
  <VListItem v-else-if="props.showAsMenu" v-bind="attrs" prepend-icon="fasl fa-cloud-arrow-up" density="compact" title="Upload" @click="() => open()" />
  <ContentListItem
    v-if="props.showAsItem && props.disableOnClick"
    v-bind="attrs"
    ref="dropZoneRef2"
    class="drop-zone rounded-lg"
    :class="{
      active: isActive && !props.isSorting,
      dragging: isDragging && !props.isSorting,
      'drop-zone--folder': props.dropStyle === 'folder',
    }"
    :is-sorting="props.isSorting"
  >
    <template #checkbox v-if="$slots.checkbox"><slot name="checkbox"></slot></template>
    <template #prepend>
      <VIcon :icon="props.prependIcon || 'fasl fa-upload'" />
    </template>
    <template #text>
      <slot name="text">
        {{ displayText }}
      </slot>
    </template>
    <template #append v-if="$slots.append"><slot name="append"></slot></template>
  </ContentListItem>
  <ContentListItem
    v-if="props.showAsItem && !props.disableOnClick"
    v-bind="attrs"
    ref="dropZoneRef3"
    class="drop-zone rounded-lg"
    :class="{
      active: isActive && !props.isSorting,
      dragging: isDragging && !props.isSorting,
      'drop-zone--folder': props.dropStyle === 'folder',
    }"
    :is-sorting="props.isSorting"
    @click="handleClick"
  >
    <template #checkbox v-if="$slots.checkbox"><slot name="checkbox"></slot></template>
    <template #prepend>
      <VIcon :icon="props.prependIcon || 'fasl fa-upload'" />
    </template>
    <template #text>
      <slot name="text">
        {{ displayText }}
      </slot>
    </template>
    <template #append v-if="$slots.append"><slot name="append"></slot></template>
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

.drop-zone.sorting {
  display: flex;
  /* Style will be handled by ContentListItem.is-sorting */
}

.drop-zone--folder.drop-zone--folder-hover {
  border-radius: 6px !important;
  border: solid 1px rgba(var(--v-theme-feature), 0.55);
  background: rgba(var(--v-theme-feature), 0.08);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-feature), 0.16);
  background-image: none;
}
</style>
