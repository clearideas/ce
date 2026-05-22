<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import BaseDialog from '../../base/BaseDialog.vue'
import { useContentStore } from '../../../stores'

interface Props {
  selected: string[]
  dialog?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  selected: () => [],
  dialog: false,
})

const emit = defineEmits<{
  'update:dialog': [value: boolean]
  'update:selected': [value: string[]]
}>()

const contentStore = useContentStore()

const dialogModel = computed({
  get: () => props.dialog,
  set: value => emit('update:dialog', value),
})

const selectedCount = computed(() => props.selected.length)

async function deleteSelected() {
  if (props.selected.length === 0) return
  const selectedItems = contentStore.contents.filter(content => props.selected.includes(content.id))
  for (const content of selectedItems) {
    await contentStore.deleteContent(content.site, content.id)
  }
  emit('update:selected', [])
  emit('update:dialog', false)
}

function cancelDelete() {
  emit('update:dialog', false)
  emit('update:selected', [])
}
</script>

<template>
  <BaseDialog v-model="dialogModel" max-width="500" title="Delete content">
    <VCardText>
      Are you sure you want to delete
      {{ selectedCount === 1 ? 'this item' : `${selectedCount} items` }}?
    </VCardText>
    <VDivider />
    <VCardActions class="bg-surface-light">
      <VSpacer />
      <BaseButton text="Cancel" color="default" variant="flat" @click="cancelDelete" />
      <BaseButton
        text="Delete"
        color="error"
        variant="flat"
        :loading="contentStore.loading"
        :disabled="selectedCount === 0"
        @click="deleteSelected"
      />
    </VCardActions>
  </BaseDialog>
</template>
