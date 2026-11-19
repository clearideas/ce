<script setup lang="ts">
import { computed } from 'vue'
import EmptyState from '../base/EmptyState.vue'
import DropZone from './actions/DropZone.vue'
import NewFolder from './actions/NewFolder.vue'
import { siteContentPermissions } from '../../config/roles'
import { ICONS } from '../../icons'
import { useSiteStore } from '../../stores'

/** Shown inside a site/folder that has no content. Offers the two ways to add some when allowed. */
interface Props {
  siteId: string
  id?: string
  loading?: boolean
}

const props = defineProps<Props>()
const siteStore = useSiteStore()
const permissions = computed(() => siteContentPermissions(siteStore.currentSite?.currentUserRole))
const canEditContent = computed(() => permissions.value.canUpload)
const canCreateFolders = computed(() => permissions.value.canCreateFolder)
</script>

<template>
  <EmptyState
    v-if="!props.loading"
    :icon="ICONS.folder"
    title="No content yet"
    :text="
      canEditContent ? 'Upload files or create a folder to get started.' : 'Nothing has been added here yet.'
    "
  >
    <template v-if="canEditContent" #actions>
      <DropZone
        :id="props.id"
        :site-id="props.siteId"
        refresh-after-post
        text="Upload files"
        variant="flat"
      />
      <NewFolder
        v-if="canCreateFolders"
        :id="props.id"
        :site-id="props.siteId"
        text="New folder"
        variant="tonal"
        color="secondary"
      />
    </template>
  </EmptyState>
</template>
