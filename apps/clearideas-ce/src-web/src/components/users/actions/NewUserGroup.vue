<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import UserGroupDialog from './UserGroupDialog.vue'

interface Props {
  showAsMenu?: boolean
  text?: string
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  color?: string
  size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
  density?: 'default' | 'comfortable' | 'compact'
  rounded?: boolean | string
  slim?: boolean
  prependIcon?: string
  dialog?: boolean
  renderUiOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showAsMenu: false,
  color: 'primary',
  variant: 'text',
  slim: true,
  size: 'default',
  density: 'comfortable',
  prependIcon: 'fasl fa-user-group',
  text: '',
  rounded: true,
  dialog: undefined,
  renderUiOnly: false,
})

const emit = defineEmits<{ 'update:dialog': [boolean] }>()
const internalDialogVisible = ref(false)

const dialogModel = computed({
  get: () => (props.dialog !== undefined ? props.dialog : internalDialogVisible.value),
  set: value => {
    if (props.dialog !== undefined) emit('update:dialog', value)
    else internalDialogVisible.value = value
  },
})

function openDialog() {
  dialogModel.value = true
}
</script>

<template>
  <BaseButton
    v-if="!!!props.showAsMenu"
    :text="props.text || 'New group'"
    :color="props.color"
    :variant="props.variant"
    density="default"
    :size="props.size"
    :prepend-icon="props.prependIcon"
    :rounded="props.rounded"
    :slim="props.slim"
    @click="openDialog"
  >
    {{ props.text || 'New group' }}
  </BaseButton>
  <VListItem
    v-if="props.showAsMenu"
    :prepend-icon="props.prependIcon"
    density="compact"
    @click.stop="openDialog"
  >
    <VListItemTitle>{{ props.text || 'New group' }}</VListItemTitle>
  </VListItem>

  <UserGroupDialog
    v-if="!props.renderUiOnly && props.dialog === undefined"
    v-model:is-dialog-visible="dialogModel"
    :is-new="true"
  />
</template>
