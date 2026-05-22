<script setup lang="ts">
import RefreshBase from '../../base/RefreshBase.vue'
import { useRefresh } from '../../../composables/useRefresh'
import { useSiteStore } from '../../../stores'

interface Props {
  showAsMenu?: boolean
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
}

const props = withDefaults(defineProps<Props>(), { showAsMenu: false, variant: 'text' })
const siteStore = useSiteStore()
const { sitesRefresh } = useRefresh()
</script>

<template>
  <RefreshBase :on-refresh="sitesRefresh" :show-as-menu="props.showAsMenu" :variant="props.variant" :loading="siteStore.loadingSites" />
</template>
