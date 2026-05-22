<script setup lang="ts">
import RefreshBase from '../../base/RefreshBase.vue'
import { useRefresh } from '../../../composables/useRefresh'
import { useContentStore } from '../../../stores'

interface Props {
  siteId: string
  id?: string
  showAsMenu?: boolean
  latest?: boolean
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  contentType?: 'file' | 'folder'
  size?: string
}

const props = withDefaults(defineProps<Props>(), {
  showAsMenu: false,
  latest: false,
  variant: 'text',
  contentType: 'folder',
  size: 'default',
})
const contentStore = useContentStore()
const { contentRefresh } = useRefresh()
</script>

<template>
  <RefreshBase
    :on-refresh="() => contentRefresh(props.siteId, props.id, props.latest, props.contentType)"
    :show-as-menu="props.showAsMenu"
    :variant="props.variant"
    :size="props.size"
    :loading="contentStore.loading"
  />
</template>
