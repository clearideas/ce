<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import IconCheckbox from '../../base/IconCheckbox.vue'
import SettingsCard from '../../base/SettingsCard.vue'
import { useDirtyForm } from '../../../composables/useDirtyForm'
import { useSiteStore } from '../../../stores'
import { ASSIGNABLE_SITE_ROLES } from '../../../config/roles'
import { getVuetifyItemRaw } from '../../../utils/vuetify'

const siteStore = useSiteStore()
const isInitialized = ref(false)
const errorMessage = ref('')
const printEnabled = ref(false)
const printRoles = ref<string[]>([])
const saving = ref(false)
const { dirty, markClean } = useDirtyForm(() => ({
  printEnabled: printEnabled.value,
  printRoles: [...printRoles.value].sort(),
}))
defineExpose({ dirty })
const roles = ASSIGNABLE_SITE_ROLES.filter(role => role.value !== 'disabled')

const roleOption = (item: unknown) => getVuetifyItemRaw<(typeof roles)[number]>(item)

function initializeComponentState() {
  const pdf = siteStore.currentSite?.attributes?.pdf || {}
  printEnabled.value = pdf.printEnabled ?? false
  printRoles.value = pdf.printRoles ?? []
  errorMessage.value = ''
  isInitialized.value = true
  markClean()
}

async function handleUpdate() {
  saving.value = true
  try {
    await siteStore.updateCurrentSite({
      attributes: { pdf: { printEnabled: printEnabled.value, printRoles: printRoles.value } },
    })
    markClean()
  } finally {
    saving.value = false
  }
}

watch(() => siteStore.currentSite, initializeComponentState, { immediate: true })
</script>

<template>
  <SettingsCard
    title="PDF options"
    subtitle="Manage PDF printing behavior for this site."
    :is-initialized="isInitialized"
    icon="fas fa-file-pdf"
    :error-message="errorMessage"
    :dirty="dirty"
  >
    <template #content>
      <h3>Printing</h3>
      <p class="text-body-2 mb-3">Allow selected roles to print PDF documents.</p>
      <div class="d-flex flex-column ga-4 mb-6">
        <IconCheckbox
          v-model="printEnabled"
          label="Enable printing"
          description="Permit PDF printing for selected roles."
        />
      </div>
      <h3>Print roles</h3>
      <VSelect
        v-model="printRoles"
        :items="roles"
        item-title="title"
        item-value="value"
        label="Roles"
        placeholder="No roles selected"
        persistent-placeholder
        density="comfortable"
        multiple
        max-width="500"
        menu-icon="fas fa-chevron-down"
        :disabled="!printEnabled"
      >
        <template #prepend-inner><VIcon icon="fas fa-print" color="secondary" /></template>
        <template #selection="{ index }">
          <span v-if="index === 0"
            >{{ printRoles.length }} {{ printRoles.length === 1 ? 'role' : 'roles' }} selected</span
          >
        </template>
        <template #item="{ props: itemProps, item }">
          <VListItem v-bind="itemProps" :prepend-icon="roleOption(item).icon" />
        </template>
      </VSelect>
    </template>
    <template #footer>
      <BaseButton text="Save" :loading="saving" :disabled="!dirty" @click="handleUpdate" />
    </template>
  </SettingsCard>
</template>
