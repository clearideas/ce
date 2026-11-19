<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseDialog from '../../base/BaseDialog.vue'
import { useContentStore } from '../../../stores'

const dialogModel = defineModel<boolean>({ required: true })
const selected = defineModel<string[]>('selected', { default: () => [] })

const contentStore = useContentStore()
const deleting = ref(false)
const progress = ref({ completed: 0, total: 0 })
const selectedCount = computed(() => selected.value.length)
const progressPercent = computed(() =>
  progress.value.total === 0 ? 0 : Math.round((progress.value.completed / progress.value.total) * 100),
)

async function deleteSelected() {
  if (selected.value.length === 0) return
  const selectedItems = contentStore.contents.filter(content => selected.value.includes(content.id))
  const siteId = selectedItems.find(content => content.site)?.site
  if (!siteId) return
  deleting.value = true
  try {
    const { failed } = await contentStore.deleteContents(
      siteId,
      selectedItems.map(content => content.id),
      (completed, total) => {
        progress.value = { completed, total }
      },
    )
    // Items that could not be deleted stay selected so the user can retry or inspect them.
    selected.value = failed.map(item => item.id)
    dialogModel.value = false
  } finally {
    deleting.value = false
    progress.value = { completed: 0, total: 0 }
  }
}
</script>

<template>
  <BaseDialog
    v-model="dialogModel"
    max-width="500"
    title="Delete content"
    confirm-text="Delete"
    confirm-intent="danger"
    :confirm-disabled="selectedCount === 0"
    :loading="deleting"
    @confirm="deleteSelected"
  >
    <VCardText>
      <p class="mb-0">
        Are you sure you want to delete
        {{ selectedCount === 1 ? 'this item' : `${selectedCount} items` }}? This cannot be undone.
      </p>
      <div v-if="deleting" class="mt-4" aria-live="polite">
        <VProgressLinear
          aria-label="Deletion progress"
          :model-value="progressPercent"
          color="error"
          height="6"
          rounded
        />
        <p class="text-caption text-medium-emphasis mt-2 mb-0">
          Deleting {{ progress.completed }} of {{ progress.total }}…
        </p>
      </div>
    </VCardText>
  </BaseDialog>
</template>
