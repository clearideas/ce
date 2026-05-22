<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import NewSiteDialog from './NewSiteDialog.vue'

interface Props {
  text?: string
  color?: string
  size?: string
  prependIcon?: string
  icon?: string
  showAsMenu?: boolean
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  dialog?: boolean
  renderUiOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  text: undefined,
  color: 'primary',
  size: 'default',
  prependIcon: 'fass fa-circle-plus',
  showAsMenu: false,
  variant: 'text',
  dialog: undefined,
  renderUiOnly: false,
})
const emit = defineEmits<{ siteCreated: []; 'update:dialog': [value: boolean] }>()
const resolvedText = computed(() => props.text ?? 'New site')
const resolvedIcon = computed(() => props.icon ?? props.prependIcon)
const internalDialogVisible = ref(false)
const dialogModel = computed({
  get: () => (props.dialog !== undefined ? props.dialog : internalDialogVisible.value),
  set: value => (props.dialog !== undefined ? emit('update:dialog', value) : (internalDialogVisible.value = value)),
})
const handleClick = () => { dialogModel.value = !dialogModel.value }
</script>

<template>
  <Tippy v-if="!props.showAsMenu" content="Create site" placement="top">
    <BaseButton
      @click="handleClick"
      :icon="props.text ? undefined : resolvedIcon"
      :prepend-icon="props.text ? resolvedIcon : undefined"
      :text="resolvedText"
      :size="props.size"
      :variant="props.variant"
      :color="props.color"
    />
  </Tippy>
  <Tippy v-else content="Create site" placement="right">
    <VListItem prepend-icon="fasl fa-plus" density="compact" @click.stop="handleClick">
      <VListItemTitle>{{ resolvedText }}</VListItemTitle>
    </VListItem>
  </Tippy>
  <NewSiteDialog v-if="!props.renderUiOnly && props.dialog === undefined" v-model="dialogModel" @site-created="emit('siteCreated')" />
</template>
