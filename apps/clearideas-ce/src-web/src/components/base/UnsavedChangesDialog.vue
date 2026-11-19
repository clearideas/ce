<script setup lang="ts">
import { storeToRefs } from 'pinia'
import BaseDialog from './BaseDialog.vue'
import { useUnsavedChangesStore } from '../../stores/unsavedChanges.store'

/** Rendered once in the app shell; opened by `useUnsavedChangesGuard()` route guards. */
const store = useUnsavedChangesStore()
const { open } = storeToRefs(store)
</script>

<template>
  <BaseDialog
    :model-value="open"
    max-width="440"
    title="Unsaved changes"
    confirm-text="Leave without saving"
    confirm-intent="danger"
    cancel-text="Keep editing"
    :show-close="false"
    persistent
    @update:model-value="value => !value && store.resolve(false)"
    @confirm="store.resolve(true)"
    @cancel="store.resolve(false)"
  >
    <VCardText>You have changes that have not been saved. Leave this page and discard them?</VCardText>
  </BaseDialog>
</template>
