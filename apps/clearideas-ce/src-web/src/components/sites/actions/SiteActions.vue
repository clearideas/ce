<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseActions from '../../base/BaseActions.vue'
import NewSite from './NewSite.vue'
import NewSiteDialog from './NewSiteDialog.vue'
import RefreshSites from './RefreshSites.vue'
import ToggleTiles from './ToggleTiles.vue'

const newSiteDialogVisible = ref(false)
const emit = defineEmits<{ interact: [] }>()

watch(newSiteDialogVisible, isVisible => {
  if (isVisible) emit('interact')
})
</script>

<template>
  <BaseActions>
    <template #primary="{ isNarrow }">
      <NewSite
        v-model:dialog="newSiteDialogVisible"
        :text="isNarrow ? '' : 'New site'"
        :icon="isNarrow ? 'fasl fa-plus' : undefined"
        :color="isNarrow ? 'primary' : undefined"
        :size="isNarrow ? 'small' : undefined"
        render-ui-only
      />
    </template>

    <ToggleTiles />
    <RefreshSites />

    <template #narrow>
      <Tippy content="More" placement="top">
        <VBtn icon="fasl fa-ellipsis" size="small" variant="text" aria-label="More">
          <VIcon>fasl fa-ellipsis-vertical</VIcon>
          <VMenu offset-y activator="parent" text="More site actions">
            <VList density="compact" nav>
              <RefreshSites show-as-menu />
              <VDivider class="my-2" />
              <ToggleTiles show-as-menu />
            </VList>
          </VMenu>
        </VBtn>
      </Tippy>
    </template>

    <template #persistent>
      <NewSiteDialog v-model="newSiteDialogVisible" />
    </template>
  </BaseActions>
</template>
