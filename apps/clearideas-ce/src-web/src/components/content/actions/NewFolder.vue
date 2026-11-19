<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import FolderDialog from './FolderDialog.vue'
import type { ButtonIntent } from '../../../types/ui'

interface Props {
  siteId: string
  id?: string
  showAsMenu?: boolean
  text?: string
  tooltip?: string
  size?: string
  color?: string
  prependIcon?: string
  icon?: string
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  intent?: ButtonIntent
  dialog?: boolean
  renderUiOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  intent: 'secondary',
  showAsMenu: false,
  size: 'default',
  prependIcon: 'fas fa-folder-plus',
  dialog: undefined,
  renderUiOnly: false,
})
const emit = defineEmits<{ 'update:dialog': [value: boolean] }>()
const resolvedLabel = computed(() => props.text ?? 'New folder')
// Icon-only mode passes `text: ''`; the tooltip/accessible name still needs the label.
const resolvedTooltip = computed(() => props.tooltip || resolvedLabel.value || 'New folder')
const resolvedIcon = computed(() => props.icon ?? props.prependIcon)
const internalDialogVisible = ref(false)
const dialogModel = computed({
  get: () => (props.dialog !== undefined ? props.dialog : internalDialogVisible.value),
  set: value =>
    props.dialog !== undefined ? emit('update:dialog', value) : (internalDialogVisible.value = value),
})
const handleClick = () => {
  dialogModel.value = !dialogModel.value
}
</script>

<template>
  <BaseButton
    v-if="!props.showAsMenu"
    :icon="props.text ? undefined : resolvedIcon"
    :prepend-icon="props.text ? resolvedIcon : undefined"
    :text="resolvedLabel"
    :size="props.size"
    :variant="props.variant"
    :intent="props.intent"
    :color="props.color"
    :tooltip="resolvedTooltip"
    :aria-label="resolvedTooltip"
    @click="handleClick"
  />
  <VListItem
    v-else
    :prepend-icon="props.prependIcon"
    density="compact"
    :aria-label="resolvedTooltip"
    @click.stop="handleClick"
  >
    <VListItemTitle>{{ resolvedLabel }}</VListItemTitle>
  </VListItem>

  <FolderDialog
    v-if="!props.renderUiOnly && props.dialog === undefined"
    v-model="dialogModel"
    :site-id="props.siteId"
    :folder-id="props.id"
    is-new
  />
</template>
