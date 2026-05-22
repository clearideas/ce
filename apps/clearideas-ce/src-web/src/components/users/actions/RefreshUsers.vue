<script setup lang="ts">
import RefreshBase from '../../base/RefreshBase.vue'
import { useRefresh } from '../../../composables/useRefresh'
import { useUserStore } from '../../../stores'
const props = withDefaults(defineProps<{ siteId?: string; showAsMenu?: boolean; variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'; size?: string }>(), { showAsMenu: false, variant: 'text', size: 'default' })
const userStore = useUserStore(); const { usersRefresh } = useRefresh()
</script>
<template><RefreshBase :on-refresh="() => usersRefresh(props.siteId)" :show-as-menu="props.showAsMenu" :variant="props.variant" :size="props.size" :loading="userStore.loadingUsers || userStore.loadingSiteUsers" /></template>
