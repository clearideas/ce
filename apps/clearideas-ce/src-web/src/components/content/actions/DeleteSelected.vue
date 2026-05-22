<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import DeleteSelectedDialog from './DeleteSelectedDialog.vue'

interface Props {
  selected: string[]
  showAsMenu?: boolean
  dialog?: boolean
  renderUiOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showAsMenu: false,
  dialog: undefined,
  renderUiOnly: false,
})

const selected = defineModel<string[]>('selected', { default: [] })

const emit = defineEmits<{
  'update:dialog': [value: boolean]
}>()

const internalDialogVisible = ref(false)

const dialogModel = computed({
  get: () => (props.dialog !== undefined ? props.dialog : internalDialogVisible.value),
  set: value => {
    if (props.dialog !== undefined) emit('update:dialog', value)
    else internalDialogVisible.value = value
  },
})

const deleteTooltip = computed(() => {
  const count = selected.value.length
  return count > 1 ? `Delete ${count} items` : 'Delete item'
})

function openDeleteConfirm() {
  if (selected.value.length === 0) return
  dialogModel.value = true
}
</script>

<template>
  <template v-if="selected.length > 0">
    <BaseButton
      v-if="!props.showAsMenu"
      icon="fasl fa-trash"
      variant="text"
      :aria-label="deleteTooltip"
      v-tippy="{
        placement: 'top',
        content: deleteTooltip,
      }"
      color="primary"
      size="small"
      @click="openDeleteConfirm"
    />
    <VListItem
      v-if="props.showAsMenu"
      prepend-icon="fasl fa-trash"
      density="compact"
      :title="deleteTooltip"
      @click.stop="openDeleteConfirm"
    />

    <DeleteSelectedDialog
      v-if="!props.renderUiOnly && props.dialog === undefined"
      v-model:dialog="dialogModel"
      v-model:selected="selected"
    />
  </template>
</template>
