<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import SettingsCard from '../../base/SettingsCard.vue'
import IconCheckbox from '../../base/IconCheckbox.vue'
import { useSiteStore } from '../../../stores'
const siteStore = useSiteStore()
const isInitialized = ref(false)
const errorMessage = ref('')
const printEnabled = ref(false)
const printRoles = ref<string[]>([])
const roles = [{ title: 'Admin', value: 'admin', icon: 'fasl fa-user-shield' }, { title: 'Editor', value: 'editor', icon: 'fasl fa-pen' }, { title: 'Uploader', value: 'uploader', icon: 'fasl fa-upload' }, { title: 'Downloader', value: 'downloader', icon: 'fasl fa-download' }, { title: 'Viewer', value: 'viewer', icon: 'fasl fa-eye' }]
function togglePrintRole(role: string) { printRoles.value = printRoles.value.includes(role) ? printRoles.value.filter(value => value !== role) : [...printRoles.value, role] }
function initializeComponentState() { const pdf = siteStore.currentSite?.attributes?.pdf || {}; printEnabled.value = pdf.printEnabled ?? false; printRoles.value = pdf.printRoles ?? []; errorMessage.value = ''; isInitialized.value = true }
async function handleUpdate() { await siteStore.updateCurrentSite({ attributes: { pdf: { printEnabled: printEnabled.value, printRoles: printRoles.value } } }) }
watch(() => siteStore.currentSite, initializeComponentState, { immediate: true })
</script>
<template>
  <SettingsCard title="PDF options" subtitle="Manage PDF printing behavior for this site." :is-initialized="isInitialized" icon="fasl fa-file-pdf" :error-message="errorMessage">
    <template #content><h4>Printing</h4><p class="text-body-2 mb-3">Allow selected roles to print PDF documents.</p><div class="d-flex flex-column ga-4 mb-6"><IconCheckbox v-model="printEnabled" label="Enable printing" description="Permit PDF printing for selected roles." /></div><h4>Print roles</h4><VMenu location="bottom start" :disabled="!printEnabled"><template #activator="{ props: menuProps }"><VTextField :model-value="printRoles.length > 0 ? `${printRoles.length} roles selected` : 'No roles selected'" readonly label="Roles" density="comfortable" :disabled="!printEnabled" v-bind="menuProps" max-width="500"><template #prepend-inner><VIcon icon="fasl fa-print" color="secondary" /></template><template #append-inner><VIcon icon="fasl fa-chevron-down" color="secondary" /></template></VTextField></template><VList density="compact" max-width="350"><VListItem v-for="role in roles" :key="role.value" :active="printRoles.includes(role.value)" @click.stop="togglePrintRole(role.value)"><template #prepend><VIcon :icon="role.icon" class="fs-14" color="secondary" /></template>{{ role.title }}<template #append><VIcon v-if="printRoles.includes(role.value)" icon="fasl fa-check" color="primary" size="14" /></template></VListItem></VList></VMenu></template>
    <template #footer><BaseButton text="Save PDF options" color="primary" variant="flat" @click="handleUpdate" /></template>
  </SettingsCard>
</template>
