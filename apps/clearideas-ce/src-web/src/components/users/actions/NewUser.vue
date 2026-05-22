<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import NewUserDialogContainer from './NewUserDialogContainer.vue'

const props = withDefaults(defineProps<{
  siteId?: string
  showSites?: boolean
  showAsMenu?: boolean
  text?: string
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  color?: string
  size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
  density?: 'default' | 'comfortable' | 'compact'
  rounded?: boolean | string
  slim?: boolean
  prependIcon?: string
  icon?: string
  existingUsersOnly?: boolean
  dialog?: boolean
  upgradeDialog?: boolean
  renderUiOnly?: boolean
}>(), {
  showSites: true,
  color: 'primary',
  variant: 'text',
  existingUsersOnly: false,
  text: '',
  size: 'default',
  slim: true,
  showAsMenu: false,
  prependIcon: 'fasl fa-user-plus',
  rounded: true,
  dialog: undefined,
  upgradeDialog: undefined,
  renderUiOnly: false,
  density: 'default',
})

const emit = defineEmits<{
  'update:dialog': [boolean]
  'update:upgradeDialog': [boolean]
}>()

const internalDialogVisible = ref(false)
const internalUpgradeDialogVisible = ref(false)
const dialogModel = computed({
  get: () => (props.dialog !== undefined ? props.dialog : internalDialogVisible.value),
  set: value => {
    if (props.dialog !== undefined) emit('update:dialog', value)
    else internalDialogVisible.value = value
  },
})
const upgradeDialogModel = computed({
  get: () => (props.upgradeDialog !== undefined ? props.upgradeDialog : internalUpgradeDialogVisible.value),
  set: value => {
    if (props.upgradeDialog !== undefined) emit('update:upgradeDialog', value)
    else internalUpgradeDialogVisible.value = value
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
  <Tippy v-if="!!!props.showAsMenu" :content="props.text || 'Add user'" placement="top">
    <BaseButton
      @click="toggleDialog"
      :icon="buttonIcon"
      :prepend-icon="buttonPrependIcon"
      :text="buttonText"
      :size="props.size"
      :variant="props.variant"
      :color="props.color"
      :density="props.density"
      :rounded="props.rounded"
      :slim="props.slim"
    />
  </Tippy>
  <VListItem
    v-if="props.showAsMenu"
    :prepend-icon="props.prependIcon"
    density="compact"
    @click.stop="toggleDialog"
  >
    <VListItemTitle>{{ props.text }}</VListItemTitle>
  </VListItem>

  <NewUserDialogContainer
    v-if="!props.renderUiOnly && props.dialog === undefined"
    v-model:is-dialog-visible="dialogModel"
    v-model:is-upgrade-dialog-visible="upgradeDialogModel"
    :show-sites="props.showSites"
    :site-id="props.siteId"
    :existing-users-only="props.existingUsersOnly"
  />
</template>
