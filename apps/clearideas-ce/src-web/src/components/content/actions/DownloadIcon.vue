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
  icon: 'fasl fa-download',
  showAsButton: false,
})

const contentStore = useContentStore()
const isDownloading = ref(false)
const resolvedLabel = computed(() => props.text ?? 'Download')
const resolvedTooltip = computed(() => resolvedLabel.value)
const progressSize = computed(() => {
  if (props.size === 'x-small') return 16
  if (props.size === 'small') return 18
  if (props.size === 'large') return 28
  if (props.size === 'x-large') return 32
  return 22
})

async function handleDownload() {
  if (props.disabled || isDownloading.value) return

  isDownloading.value = true
  try {
    const item = contentStore.file?.id === props.id
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
  <Tippy v-if="!props.showAsMenu && props.showAsButton" :content="resolvedTooltip" placement="top">
    <VBtn
      icon="fasl fa-download"
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
  <VProgressCircular
    v-if="!props.showAsMenu && !props.showAsButton && isDownloading"
    indeterminate
    :color="props.color"
    :size="progressSize"
    width="2"
  />
  <VIcon
    v-if="!props.showAsMenu && !props.showAsButton && !isDownloading"
    v-tippy="{ content: resolvedTooltip, placement: 'top' }"
    :icon="props.icon"
    :color="props.color"
    :size="props.size"
    @click="handleDownload"
  />
  <VListItem
    v-if="props.showAsMenu && props.kind === 'file'"
    :disabled="props.disabled || isDownloading"
    @click="handleDownload"
  >
    <template #append>
      <VProgressCircular
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
