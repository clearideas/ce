<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import FolderDialog from './FolderDialog.vue'

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
  dialog?: boolean
  renderUiOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showAsMenu: false,
  variant: 'text',
  size: 'default',
  color: 'primary',
  prependIcon: 'fass fa-folder-plus',
  dialog: undefined,
  renderUiOnly: false,
})
const emit = defineEmits<{ 'update:dialog': [value: boolean] }>()
const resolvedLabel = computed(() => props.text ?? 'New folder')
const resolvedTooltip = computed(() => props.tooltip ?? resolvedLabel.value)
const resolvedIcon = computed(() => props.icon ?? props.prependIcon)
const internalDialogVisible = ref(false)
const dialogModel = computed({
  get: () => (props.dialog !== undefined ? props.dialog : internalDialogVisible.value),
  set: value => (props.dialog !== undefined ? emit('update:dialog', value) : (internalDialogVisible.value = value)),
})
const handleClick = () => { dialogModel.value = !dialogModel.value }
</script>

<template>
  <Tippy v-if="!props.showAsMenu" :content="resolvedTooltip" placement="top">
    <BaseButton
      @click="handleClick"
      :icon="props.text ? undefined : resolvedIcon"
      :prepend-icon="props.text ? resolvedIcon : undefined"
      :text="resolvedLabel"
      :size="props.size"
      :variant="props.variant"
      :color="props.color"
      :aria-label="resolvedTooltip"
    />
  </Tippy>
  <VListItem v-else :prepend-icon="props.prependIcon" density="compact" :aria-label="resolvedTooltip" @click.stop="handleClick">
    <VListItemTitle>{{ resolvedLabel }}</VListItemTitle>
  </VListItem>

  <FolderDialog
    v-if="!props.renderUiOnly && props.dialog === undefined"
    v-model:is-dialog-visible="dialogModel"
    :site-id="props.siteId"
    :folder-id="props.id"
    is-new
  />
</template>
