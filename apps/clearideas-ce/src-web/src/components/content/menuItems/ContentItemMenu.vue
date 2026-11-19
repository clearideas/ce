<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { VForm } from 'vuetify/components/VForm'
import BaseButton from '../../base/BaseButton.vue'
import BaseDialog from '../../base/BaseDialog.vue'
import DownloadIcon from '../actions/DownloadIcon.vue'
import { siteContentPermissions } from '../../../config/roles'
import { useContentStore, useSiteStore } from '../../../stores'
import type { ContentItem } from '../../../types/domain'

/**
 * The "More actions" menu of a content row or tile. Menu items close the menu; the rename and delete
 * dialogs live outside the menu so closing it never unmounts them.
 */
interface Props {
  item: ContentItem
  icon?: string
  density?: 'compact' | 'comfortable' | 'default'
  color?: string
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
}

const p = withDefaults(defineProps<Props>(), {
  icon: 'fas fa-ellipsis',
  density: 'default',
  color: 'primary',
  variant: 'text',
})

const content = ref<ContentItem | null>(null)
const siteStore = useSiteStore()
const contentStore = useContentStore()
const router = useRouter()
const menuOpen = ref(false)

const permissions = computed(() => siteContentPermissions(siteStore.currentSite?.currentUserRole))
const canEdit = computed(() => permissions.value.canEdit)
const canDownloadContent = computed(() => content.value?.kind === 'file' && permissions.value.canDownload)

onMounted(() => {
  content.value = p.item
})

function openFolder() {
  if (!content.value) return
  void router.push({
    name: 'site-folder-tab',
    params: { siteId: content.value.site, folderId: content.value.id, siteTab: 'content' },
  })
}

function openProperties() {
  if (!content.value) return
  void router.push({
    name: 'file',
    params: { siteId: content.value.site, fileId: content.value.id, fileTab: 'properties' },
  })
}

// ---- rename ------------------------------------------------------------------------------------
const renameDialog = ref(false)
const renameForm = ref<VForm>()
const newName = ref('')
const renaming = ref(false)

function openRename() {
  newName.value = content.value?.name ?? ''
  renameDialog.value = true
}

async function rename() {
  if (!content.value) return
  const validation = await renameForm.value?.validate()
  if (!validation?.valid) return
  renaming.value = true
  try {
    await contentStore.updateContent(content.value.site, content.value.id, { name: newName.value })
    content.value.name = newName.value
    renameDialog.value = false
  } finally {
    renaming.value = false
  }
}

// ---- delete ------------------------------------------------------------------------------------
const deleteDialog = ref(false)
const deleting = ref(false)

async function deleteItem() {
  if (!content.value?.site || !content.value?.id) return
  deleting.value = true
  try {
    await contentStore.deleteContent(content.value.site, content.value.id)
    deleteDialog.value = false
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="content !== null && content !== undefined">
    <VMenu v-model="menuOpen" offset-y text="More">
      <template #activator="{ props }">
        <BaseButton
          v-bind="props"
          :icon="p.icon"
          intent="tertiary"
          :color="p.color"
          size="small"
          density="comfortable"
          tooltip="More actions"
          :aria-label="`More actions for ${content.name}`"
          aria-haspopup="menu"
          @click.stop.prevent
        />
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
        <VListItem v-if="canEdit" density="compact" @click="openRename">
          <VListItemTitle>Rename</VListItemTitle>
        </VListItem>
        <VListItem v-if="content.kind === 'file'" density="compact" @click="openProperties">
          <VListItemTitle>Properties</VListItemTitle>
        </VListItem>
        <VListItem v-else density="compact" @click="openFolder">
          <VListItemTitle>Open</VListItemTitle>
        </VListItem>
        <VDivider v-if="canEdit" class="my-1" aria-hidden="true" />
        <VListItem v-if="canEdit" density="compact" @click="deleteDialog = true">
          <VListItemTitle>Delete</VListItemTitle>
        </VListItem>
      </VList>
    </VMenu>

    <BaseDialog
      v-model="renameDialog"
      width="500"
      title="Rename"
      form="rename-content-form"
      confirm-text="Rename"
      :confirm-disabled="!newName"
      :loading="renaming"
    >
      <VForm id="rename-content-form" ref="renameForm" @submit.prevent="rename">
        <VCardText>
          <VTextField
            v-model="newName"
            autofocus
            label="Name"
            :rules="[v => !!v || 'Name is required']"
            maxlength="500"
          />
        </VCardText>
      </VForm>
    </BaseDialog>

    <BaseDialog
      v-model="deleteDialog"
      max-width="500"
      title="Delete content"
      confirm-text="Delete"
      confirm-intent="danger"
      :loading="deleting"
      @confirm="deleteItem"
    >
      <VCardText> Are you sure you want to delete "{{ content?.name || 'content' }}"? </VCardText>
    </BaseDialog>
  </div>
</template>
