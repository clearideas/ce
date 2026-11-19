<script setup lang="ts">
import { computed, ref } from 'vue'
import { useContentStore } from '../../../stores'

interface Props {
  id: string
  siteId: string
  visibility?: boolean
  kind: 'file' | undefined
  showAsMenu?: boolean
  showAsButton?: boolean
  text?: string
  color?: string
  icon?: string
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  size?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showAsMenu: false,
  visibility: true,
  variant: 'text',
  size: 'default',
  text: undefined,
  color: 'primary',
  icon: 'fas fa-download',
  showAsButton: false,
})

const contentStore = useContentStore()
const isDownloading = ref(false)
const resolvedLabel = computed(() => props.text || 'Download')
const resolvedTooltip = computed(() => resolvedLabel.value)

async function handleDownload() {
  if (props.disabled || isDownloading.value) return

  isDownloading.value = true
  try {
    const item =
      contentStore.file?.id === props.id
        ? contentStore.file
        : contentStore.contents.find(content => content.id === props.id)
    const url = await contentStore.createFileAccessUrl(item, 'download')
    if (!url) return
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = item?.name ?? ''
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    isDownloading.value = false
  }
}
</script>

<template>
  <!-- Outside a menu it is always a real, named button (an icon with a click handler is neither
       focusable nor announced). `showAsButton` is kept for existing call sites. -->
  <Tippy v-if="!props.showAsMenu" :content="resolvedTooltip" placement="top">
    <VBtn
      icon="fas fa-download"
      :variant="props.variant"
      :color="props.color"
      :disabled="props.disabled || isDownloading"
      :loading="isDownloading"
      :size="props.size"
      :aria-label="resolvedTooltip"
      class="cursor-pointer"
      @click="handleDownload"
    />
  </Tippy>
  <VListItem
    v-if="props.showAsMenu && props.kind === 'file'"
    :disabled="props.disabled || isDownloading"
    @click="handleDownload"
  >
    <template #append>
      <VProgressCircular
        aria-label="Downloading"
        v-if="isDownloading"
        indeterminate
        color="secondary"
        size="small"
        width="2"
      />
      <VIcon v-else size="small" :icon="props.icon" />
    </template>
    <VListItemTitle>
      {{ resolvedLabel }}
    </VListItemTitle>
  </VListItem>
</template>
