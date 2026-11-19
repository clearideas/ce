<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { reactive, ref, watch } from 'vue'
import BaseButton from '../base/BaseButton.vue'
import SettingsCard from '../base/SettingsCard.vue'
import { useAlert } from '../../composables/useAlert'
import { useDirtyForm } from '../../composables/useDirtyForm'
import { useProfileStore } from '../../stores'

/** Display name and account name. Emits nothing; saves through the profile store. */
const profileStore = useProfileStore()
const { user, account, loading } = storeToRefs(profileStore)
const alert = useAlert()

const form = reactive({ displayName: '', accountName: '' })
const saving = ref(false)
const errorMessage = ref('')
const { dirty, markClean } = useDirtyForm(() => ({ ...form }))
defineExpose({ dirty })

function syncFromStore() {
  form.displayName = user.value?.displayName || user.value?.name || ''
  form.accountName = account.value?.name || ''
  markClean()
}

async function save() {
  saving.value = true
  errorMessage.value = ''
  // Read both values before the first request: updating the profile refreshes the store, and the
  // store watcher re-syncs the form, which would otherwise send the *old* account name.
  const displayName = form.displayName.trim()
  const accountName = form.accountName.trim()
  try {
    await profileStore.updateProfile({ displayName }, { silent: true })
    await profileStore.updateAccount({ name: accountName }, { silent: true })
    markClean()
    alert.add({ message: 'Profile updated.', type: 'success', timeout: 3000 })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Profile could not be updated.'
  } finally {
    saving.value = false
  }
}

watch([user, account], syncFromStore, { immediate: true })
</script>

<template>
  <SettingsCard
    title="Profile"
    subtitle="Manage your display name and account name."
    icon="fas fa-id-card"
    :is-initialized="!loading"
    :dirty="dirty"
    :error-message="errorMessage"
  >
    <h3>Email</h3>
    <p class="text-body-2">{{ user?.email }}</p>
    <h3 class="mt-4">Display name</h3>
    <p class="text-body-2">This name appears throughout the app and in activity records.</p>
    <VTextField
      v-model="form.displayName"
      aria-label="Display name"
      class="mb-4"
      max-width="500"
      maxlength="50"
    />
    <h3>Account name</h3>
    <p class="text-body-2">The label for this workspace.</p>
    <VTextField
      v-model="form.accountName"
      aria-label="Account name"
      class="mb-4"
      max-width="500"
      maxlength="100"
    />
    <template #footer>
      <BaseButton text="Save profile" :loading="saving" :disabled="!dirty" @click="save" />
    </template>
  </SettingsCard>
</template>
