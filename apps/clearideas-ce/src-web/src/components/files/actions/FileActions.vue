<script setup lang="ts">
import { computed } from 'vue'
import BaseActions from '../../base/BaseActions.vue'
import DownloadIcon from '../../content/actions/DownloadIcon.vue'
import Refresh from '../../content/actions/RefreshContent.vue'
import { useContentStore, useSiteStore } from '../../../stores'

interface Props {
  id: string
  siteId: string
  tab?: string
}

const props = defineProps<Props>()

const siteStore = useSiteStore()
const contentStore = useContentStore()

const canDownload = computed(() => {
  const role = siteStore.currentSite?.currentUserRole || ''
  return role !== 'viewer'
})
</script>

<template>
  <BaseActions>
    <!-- Regular file actions -->
    <Refresh :id="id" :site-id="props.siteId" content-type="file" />
    <DownloadIcon
      v-if="contentStore.file?.kind === 'file' && canDownload"
      :id="(contentStore.file && contentStore.file?.id) || ''"
      :site-id="(contentStore.file && contentStore.file?.site) || ''"
      kind="file"
      :show-as-button="true"
    />

    <template #narrow>
      <Refresh v-if="!(contentStore.file?.kind === 'file' && canDownload)" :id="id" :site-id="props.siteId" content-type="file" size="small" />
      <Tippy v-else content="More" placement="top">
        <VBtn size="small" variant="text" icon aria-label="More">
          <VIcon>fasl fa-ellipsis-vertical</VIcon>
          <VMenu offset-y activator="parent" text="More">
            <VList density="compact" nav>
              <Refresh :id="id" show-as-menu :site-id="props.siteId" content-type="file" />
              <DownloadIcon
                :id="(contentStore.file && contentStore.file?.id) || ''"
                :site-id="(contentStore.file && contentStore.file?.site) || ''"
                text="Download"
                kind="file"
                show-as-menu
              />
            </VList>
          </VMenu>
        </VBtn>
      </Tippy>
    </template>
  </BaseActions>
</template>
