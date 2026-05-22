<script setup lang="ts">
import { computed } from 'vue'
import UserDialog from './UserDialog.vue'

interface Props {
  isDialogVisible: boolean
  isUpgradeDialogVisible?: boolean
  showSites: boolean
  siteId?: string | null
  existingUsersOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isDialogVisible: false,
  isUpgradeDialogVisible: false,
  showSites: true,
  existingUsersOnly: false,
  siteId: null,
})

const emit = defineEmits<{
  'update:isDialogVisible': [boolean]
  'update:isUpgradeDialogVisible': [boolean]
}>()

const userDialogModel = computed({
  get: () => props.isDialogVisible,
  set: value => emit('update:isDialogVisible', value),
})
</script>

<template>
  <UserDialog
    v-model:is-dialog-visible="userDialogModel"
    :show-sites="props.showSites"
    :site-id="props.siteId ?? undefined"
    :existing-users-only="props.existingUsersOnly"
  />
</template>
