<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import BaseActions from '../../base/BaseActions.vue'
import ToggleTiles from '../../sites/actions/ToggleTiles.vue'
import DeleteSelected from './DeleteSelected.vue'
import DeleteSelectedDialog from './DeleteSelectedDialog.vue'
import DropZone from './DropZone.vue'
import FolderDialog from './FolderDialog.vue'
import NewFolder from './NewFolder.vue'
import Refresh from './RefreshContent.vue'
import SortContent from './SortContent.vue'
import { siteContentPermissions } from '../../../config/roles'
import { useSiteStore } from '../../../stores'

interface Props {
  siteId: string
  id?: string
  canUpload?: boolean
  containerWidth?: number
  narrowBreakpoint?: number
}

const props = withDefaults(defineProps<Props>(), { canUpload: true })
const selected = defineModel<string[]>('selected', { default: () => [] })
const siteStore = useSiteStore()
const newFolderDialogVisible = ref(false)
const deleteSelectedDialogVisible = ref(false)
// Offer only what the server allows for the user's role (viewers and downloaders get neither
// New folder nor Upload; rename/delete need an editor role).
const permissions = computed(() => siteContentPermissions(siteStore.currentSite?.currentUserRole))
const canEditContent = computed(() => permissions.value.canEdit)
const canUpload = computed(() => props.canUpload && permissions.value.canUpload)
/**
 * Smallest phones (< 380 px, e.g. 360 px Android): Upload lives only in the ⋮ menu, so the site's tabs
 * (Content, AI, Users, Settings) still fit next to the toolbar instead of being cut off.
 */
const { width } = useDisplay()
const uploadInMenuOnly = computed(() => width.value < 380)

watch(
  canEditContent,
  canEdit => {
    if (!canEdit) selected.value = []
  },
  { immediate: true },
)
</script>

<template>
  <BaseActions :container-width="containerWidth" :narrow-breakpoint="narrowBreakpoint">
    <template #primary="{ isNarrow }">
      <NewFolder
        v-if="permissions.canCreateFolder"
        :id="props.id"
        v-model:dialog="newFolderDialogVisible"
        :site-id="props.siteId"
        :text="isNarrow ? '' : 'New folder'"
        :icon="isNarrow ? 'fas fa-folder-plus' : undefined"
        :size="isNarrow ? 'small' : undefined"
        render-ui-only
      />
      <DropZone
        v-if="canUpload && !(isNarrow && uploadInMenuOnly)"
        :id="props.id"
        :site-id="props.siteId"
        refresh-after-post
        :text="isNarrow ? '' : 'Upload'"
        :icon="isNarrow ? 'fas fa-cloud-arrow-up' : undefined"
        :size="isNarrow ? 'small' : undefined"
      />
    </template>

    <SortContent />
    <ToggleTiles :show-as-menu="false" />
    <DeleteSelected
      v-if="canEditContent"
      v-model:selected="selected"
      v-model:dialog="deleteSelectedDialogVisible"
      render-ui-only
    />
    <Refresh :id="props.id" :site-id="props.siteId" />

    <template #narrow>
      <Tippy content="More" placement="top">
        <VBtn size="small" variant="text" icon aria-label="More">
          <VIcon>fas fa-ellipsis-vertical</VIcon>
          <VMenu offset-y activator="parent" text="More content actions">
            <VList density="compact" nav>
              <DropZone
                v-if="canUpload"
                :id="props.id"
                :site-id="props.siteId"
                show-as-menu
                refresh-after-post
              />
              <Refresh :id="props.id" show-as-menu :site-id="props.siteId" />
              <DeleteSelected
                v-if="canEditContent"
                v-model:selected="selected"
                v-model:dialog="deleteSelectedDialogVisible"
                show-as-menu
                render-ui-only
              />
              <VDivider aria-hidden="true" class="mt-2" />
              <SortContent show-as-menu />
              <VDivider aria-hidden="true" class="mt-2" />
              <VListSubheader>Display</VListSubheader>
              <ToggleTiles show-as-menu />
            </VList>
          </VMenu>
        </VBtn>
      </Tippy>
    </template>

    <template #persistent>
      <FolderDialog v-model="newFolderDialogVisible" :site-id="props.siteId" :folder-id="props.id" is-new />
      <DeleteSelectedDialog v-model="deleteSelectedDialogVisible" v-model:selected="selected" />
    </template>
  </BaseActions>
</template>
