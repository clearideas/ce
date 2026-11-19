<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import { ICONS } from '../../../icons'
import NewSiteDialog from './NewSiteDialog.vue'
import type { ButtonIntent } from '../../../types/ui'

interface Props {
  text?: string
  color?: string
  size?: string
  prependIcon?: string
  icon?: string
  showAsMenu?: boolean
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  intent?: ButtonIntent
  dialog?: boolean
  renderUiOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  intent: 'primary',
  text: undefined,
  size: 'default',
  prependIcon: 'fas fa-circle-plus',
  showAsMenu: false,
  dialog: undefined,
  renderUiOnly: false,
})
const emit = defineEmits<{ siteCreated: []; 'update:dialog': [value: boolean] }>()
const resolvedText = computed(() => props.text ?? 'New site')
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
    :text="resolvedText"
    :size="props.size"
    :variant="props.variant"
    :intent="props.intent"
    :color="props.color"
    tooltip="Create site"
    :aria-label="props.text === '' ? 'New site' : undefined"
    @click="handleClick"
  />
  <VListItem v-else :prepend-icon="ICONS.add" density="compact" @click.stop="handleClick">
    <VListItemTitle>{{ resolvedText }}</VListItemTitle>
  </VListItem>
  <NewSiteDialog
    v-if="!props.renderUiOnly && props.dialog === undefined"
    v-model="dialogModel"
    @site-created="emit('siteCreated')"
  />
</template>
