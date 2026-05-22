<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseButton from '../../base/BaseButton.vue'
import BaseDialog from '../../base/BaseDialog.vue'
import DownloadIcon from '../actions/DownloadIcon.vue'
import { useContentStore, useSiteStore } from '../../../stores'
import PropertiesMenuItem from './PropertiesMenuItem.vue'
import RenameMenuItem from './RenameMenuItem.vue'

interface Props {
  item: any
  icon?: string
  density?: 'compact' | 'comfortable' | 'default'
  color?: string
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
}

const p = withDefaults(defineProps<Props>(), {
  icon: 'fasl fa-ellipsis',
  density: 'default',
  color: 'primary',
  variant: 'text',
})

const content = ref<any | null>(null)
const siteStore = useSiteStore()
const contentStore = useContentStore()
const router = useRouter()
const isDeleteDialogVisible = ref(false)

const canEdit = computed(() =>
  ['owner', 'admin', 'editor'].includes(siteStore.currentSite?.currentUserRole || ''),
)

const canDownloadContent = computed(() => {
  const role = siteStore.currentSite?.currentUserRole || ''
  return content.value?.kind === 'file' && role !== 'viewer'
})

onMounted(() => {
  content.value = p.item
})

async function deleteItem() {
  if (!content.value?.site || !content.value?.id) return
  await contentStore.deleteContent(content.value.site, content.value.id)
  isDeleteDialogVisible.value = false
}
</script>

<template>
  <div v-if="content !== null && content !== undefined">
    <VMenu offset-y text="More">
      <template #activator="{ props }">
        <VIcon
          v-tippy="{ content: 'More' }"
          :color="p.color"
          v-bind="props"
          aria-label="More"
          @click.stop.prevent
        >
          {{ p.icon }}
        </VIcon>
      </template>
      <VList density="compact" nav>
        <DownloadIcon
          v-if="canDownloadContent"
          :id="content.id"
          :site-id="content.site"
          kind="file"
          show-as-menu
          text="Download"
        />
        <RenameMenuItem
          v-if="canEdit"
          :id="content.id"
          v-model="content.name"
          :site-id="content.site"
        />
        <PropertiesMenuItem
          v-if="content.kind === 'file'"
          :id="content.id"
          :site-id="content.site"
        />
        <VListItem
          v-else
          density="compact"
          @click.stop="
            router.push({
              name: 'site-folder-tab',
              params: { siteId: content.site, folderId: content.id, siteTab: 'content' },
            })
          "
        >
          <VListItemTitle>Open</VListItemTitle>
        </VListItem>
        <VDivider v-if="canEdit" class="my-1" />
        <VListItem
          v-if="canEdit"
          density="compact"
          @click.stop="isDeleteDialogVisible = true"
        >
          <VListItemTitle>Delete</VListItemTitle>
        </VListItem>
      </VList>
    </VMenu>
    <BaseDialog
      v-model="isDeleteDialogVisible"
      max-width="500"
      title="Delete content"
    >
      <VCardText>
        Are you sure you want to delete "{{ content?.name || 'content' }}"?
      </VCardText>
      <VDivider />
      <VCardActions class="bg-surface-light">
        <VSpacer />
        <BaseButton text="Cancel" color="default" variant="flat" @click="isDeleteDialogVisible = false" />
        <BaseButton text="Delete" color="error" variant="flat" :loading="contentStore.loading" @click="deleteItem" />
      </VCardActions>
    </BaseDialog>
  </div>
</template>
