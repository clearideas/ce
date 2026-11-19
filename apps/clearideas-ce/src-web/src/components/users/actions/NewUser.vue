<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import UserDialog from './UserDialog.vue'
import type { ButtonIntent } from '../../../types/ui'

const props = withDefaults(
  defineProps<{
    siteId?: string
    showSites?: boolean
    showAsMenu?: boolean
    text?: string
    variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
    intent?: ButtonIntent
    color?: string
    size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
    density?: 'default' | 'comfortable' | 'compact'
    slim?: boolean
    prependIcon?: string
    icon?: string
    existingUsersOnly?: boolean
    dialog?: boolean
    renderUiOnly?: boolean
  }>(),
  {
    intent: 'primary',
    showSites: true,
    existingUsersOnly: false,
    text: '',
    size: 'default',
    slim: true,
    showAsMenu: false,
    prependIcon: 'fas fa-user-plus',
    dialog: undefined,
    renderUiOnly: false,
    density: 'default',
  },
)

const emit = defineEmits<{
  'update:dialog': [boolean]
}>()

const internalDialogVisible = ref(false)
const dialogModel = computed({
  get: () => (props.dialog !== undefined ? props.dialog : internalDialogVisible.value),
  set: value => {
    if (props.dialog !== undefined) emit('update:dialog', value)
    else internalDialogVisible.value = value
  },
})
const buttonText = computed(() => (props.text === '' && props.icon ? undefined : props.text || 'Add user'))
const buttonIcon = computed(() => (buttonText.value ? undefined : (props.icon ?? props.prependIcon)))
const buttonPrependIcon = computed(() => (buttonText.value ? props.prependIcon : undefined))

function toggleDialog() {
  dialogModel.value = true
}
</script>

<template>
  <BaseButton
    v-if="!props.showAsMenu"
    :icon="buttonIcon"
    :prepend-icon="buttonPrependIcon"
    :text="buttonText"
    :size="props.size"
    :variant="props.variant"
    :intent="props.intent"
    :color="props.color"
    :density="props.density"
    :slim="props.slim"
    :tooltip="props.text || 'Add user'"
    :aria-label="props.text || 'Add user'"
    @click="toggleDialog"
  />
  <VListItem
    v-if="props.showAsMenu"
    :prepend-icon="props.prependIcon"
    density="compact"
    @click.stop="toggleDialog"
  >
    <VListItemTitle>{{ props.text }}</VListItemTitle>
  </VListItem>

  <UserDialog
    v-if="!props.renderUiOnly && props.dialog === undefined"
    v-model="dialogModel"
    :show-sites="props.showSites"
    :site-id="props.siteId"
    :existing-users-only="props.existingUsersOnly"
  />
</template>
