<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useContentStore } from '../../../stores'

interface Props {
  alwaysDisplay?: boolean
  showText?: boolean
  height: number
}

const props = defineProps<Props>()

const contentStore = useContentStore()
const isActive = ref<boolean>(props.alwaysDisplay || false)

const progress = computed<number>(() => {
  return contentStore.currentProgress[0] ?? 0
})

watch(
  () => contentStore.isUploading,
  uploading => {
    if (!uploading)
      setTimeout(() => {
        isActive.value = props.alwaysDisplay || false
      }, 3000)
    else isActive.value = true
  },
  { immediate: true, deep: true },
)
</script>

<template>
  <div class="content-upload-status" :style="{ height: isActive ? 'auto' : `${props.height}px` }">
    <VProgressLinear
      v-if="isActive"
      :model-value="progress"
      :indeterminate="contentStore.isIndeterminate"
      striped
      :height="props.height"
      :color="contentStore.isUploadingError ? 'error' : 'success'"
    >
      <template v-if="props.showText" #default="{ value }">
        <span class="font-weight-bold">{{ value }}%</span>
      </template>
    </VProgressLinear>
    <div v-else :style="{ height: `${props.height}px` }" />
  </div>
</template>
