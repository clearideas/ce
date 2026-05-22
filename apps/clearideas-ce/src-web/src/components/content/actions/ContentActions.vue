<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseActions from '../../base/BaseActions.vue'
import ToggleTiles from '../../sites/actions/ToggleTiles.vue'
import DeleteSelected from './DeleteSelected.vue'
import DeleteSelectedDialog from './DeleteSelectedDialog.vue'
import DropZone from './DropZone.vue'
import FolderDialog from './FolderDialog.vue'
import NewFolder from './NewFolder.vue'
import Refresh from './RefreshContent.vue'
import { useSiteStore } from '../../../stores'

interface Props {
  siteId: string
  id?: string
  canUpload?: boolean
  containerWidth?: number
  narrowBreakpoint?: number
}

const props = withDefaults(defineProps<Props>(), { canUpload: true })
const emit = defineEmits<{ interact: [] }>()
const selected = defineModel<string[]>('selected', { default: [] })
const siteStore = useSiteStore()
const newFolderDialogVisible = ref(false)
const deleteSelectedDialogVisible = ref(false)
const canEditContent = computed(() =>
  ['owner', 'admin', 'editor'].includes(siteStore.currentSite?.currentUserRole || ''),
)

watch(newFolderDialogVisible, isVisible => {
  if (isVisible) emit('interact')
})

watch(deleteSelectedDialogVisible, isVisible => {
  if (isVisible) emit('interact')
})

watch(canEditContent, canEdit => {
  if (!canEdit) selected.value = []
}, { immediate: true })
</script>

<template>
  <BaseActions :container-width="containerWidth" :narrow-breakpoint="narrowBreakpoint">
    <template #primary="{ isNarrow }">
      <NewFolder
        :id="props.id"
        :site-id="props.siteId"
        v-model:dialog="newFolderDialogVisible"
        :text="isNarrow ? '' : 'New folder'"
        :icon="isNarrow ? 'fasl fa-folder-plus' : undefined"
        :size="isNarrow ? 'small' : undefined"
        render-ui-only
      />
      <DropZone
        v-if="props.canUpload"
        :id="props.id"
        :site-id="props.siteId"
        refresh-after-post
        :text="isNarrow ? '' : 'Upload'"
        :icon="isNarrow ? 'fasl fa-cloud-arrow-up' : undefined"
        :size="isNarrow ? 'small' : undefined"
      />
    </template>

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
          <VIcon>fasl fa-ellipsis-vertical</VIcon>
          <VMenu offset-y activator="parent" text="More content actions">
            <VList density="compact" nav>
              <Refresh :id="props.id" show-as-menu :site-id="props.siteId" />
              <DeleteSelected
                v-if="canEditContent"
                v-model:selected="selected"
                v-model:dialog="deleteSelectedDialogVisible"
                show-as-menu
                render-ui-only
              />
              <DropZone v-if="props.canUpload" :id="props.id" :site-id="props.siteId" show-as-menu refresh-after-post />
              <VDivider class="mt-2" />
              <VListSubheader>Display</VListSubheader>
              <ToggleTiles show-as-menu />
            </VList>
          </VMenu>
        </VBtn>
      </Tippy>
    </template>

    <template #persistent>
      <FolderDialog v-model:is-dialog-visible="newFolderDialogVisible" :site-id="props.siteId" :folder-id="props.id" is-new />
      <DeleteSelectedDialog
        v-model:dialog="deleteSelectedDialogVisible"
        v-model:selected="selected"
      />
    </template>
  </BaseActions>
</template>
