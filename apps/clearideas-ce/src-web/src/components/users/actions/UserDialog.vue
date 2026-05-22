<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { VForm } from 'vuetify/components'
import BaseButton from '../../base/BaseButton.vue'
import BaseDialog from '../../base/BaseDialog.vue'
import ContentListItem from '../../content/ContentListItem.vue'
import { useSiteStore, useUserStore } from '../../../stores'

interface Props {
  siteId?: string
  showSites?: boolean
  existingUsersOnly?: boolean
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  showSites: true,
  existingUsersOnly: false,
  title: undefined,
})

const isDialogVisible = defineModel<boolean>('isDialogVisible', { required: true })
const userStore = useUserStore()
const siteStore = useSiteStore()
const refForm = ref<VForm>()
const email = ref('')
const displayName = ref('')
const selectedSites = ref<string[]>([])
const role = ref('viewer')
const isLoading = ref(false)
const dialogTitle = computed(() => props.title || 'Add user')
const filteredSites = computed(() => siteStore.sites.filter(site => site.currentUserRole === 'owner' || site.currentUserRole === 'admin'))
const selectedSitesLabel = computed(() => selectedSites.value.length > 0 ? `${selectedSites.value.length} sites selected` : 'Select sites')
const roleOptions = [
  {
    title: 'Admin',
    subtitle: 'Can manage all site settings and users',
    value: 'admin',
    icon: 'fasl fa-user-shield',
  },
  {
    title: 'Editor',
    subtitle: 'Can manage all site content',
    value: 'editor',
    icon: 'fasl fa-pencil',
  },
  {
    title: 'Uploader',
    subtitle: 'Can upload content',
    value: 'uploader',
    icon: 'fasl fa-upload',
  },
  {
    title: 'Downloader',
    subtitle: 'Can view and download content',
    value: 'downloader',
    icon: 'fasl fa-arrow-down',
  },
  {
    title: 'Viewer',
    subtitle: 'Can view content',
    value: 'viewer',
    icon: 'fasl fa-eye',
  },
  {
    title: 'Disabled',
    subtitle: 'Cannot access site',
    value: 'disabled',
    icon: 'fasl fa-ban',
  },
]
const selectedRoleLabel = computed(() => roleOptions.find(option => option.value === role.value)?.title ?? 'Select role')

function resetForm() {
  email.value = ''
  displayName.value = ''
  selectedSites.value = props.siteId ? [props.siteId] : []
  role.value = 'viewer'
  isLoading.value = false
}

function handleCancel() {
  isDialogVisible.value = false
  resetForm()
}

function toggleSite(siteId: string) {
  selectedSites.value = selectedSites.value.includes(siteId)
    ? selectedSites.value.filter(id => id !== siteId)
    : [...selectedSites.value, siteId]
}

watch(isDialogVisible, async value => {
  if (!value) return
  await nextTick()
  resetForm()
  if (props.showSites) await siteStore.getSitesIfRequired()
})

async function addUser() {
  const validation = await refForm.value?.validate()
  if (!validation?.valid) return
  isLoading.value = true
  try {
    await userStore.createUser({
      email: email.value,
      displayName: displayName.value,
      siteIds: props.siteId ? [props.siteId] : selectedSites.value,
      siteRole: role.value,
    })
    handleCancel()
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="isDialogVisible" width="500" :title="dialogTitle">
    <VForm ref="refForm" @submit.prevent="addUser">
      <VCardText>
        <div class="d-flex flex-column ga-4">
          <VTextField
            v-model="email"
            label="Email"
            type="email"
            autofocus
            :rules="[(value: string) => /.+@.+\..+/.test(String(value || '')) || 'Valid email is required']"
          />
          <VTextField
            v-model="displayName"
            label="Name"
            maxlength="100"
          />
          <div v-if="props.showSites && !props.siteId">
            <VMenu location="bottom start" :close-on-content-click="false">
              <template #activator="{ props: menuProps }">
                <VTextField
                  :model-value="selectedSitesLabel"
                  readonly
                  label="Sites"
                  density="comfortable"
                  v-bind="menuProps"
                  :rules="[() => selectedSites.length > 0 || 'At least one site is required']"
                >
                  <template #prepend-inner>
                    <VIcon icon="fasl fa-building" color="secondary" />
                  </template>
                  <template #append-inner>
                    <VIcon icon="fasl fa-chevron-down" color="secondary" />
                  </template>
                </VTextField>
              </template>
              <VList density="compact" max-width="400" max-height="300">
                <VListItem
                  v-for="site in filteredSites"
                  :key="site.id"
                  :active="selectedSites.includes(site.id)"
                  @click.stop="toggleSite(site.id)"
                >
                  <ContentListItem
                    :text="site.name"
                    :prepend-icon="(site.icon && `fasl ${site.icon}`) || 'fasl fa-folder-open'"
                  />
                  <template #append>
                    <VIcon v-if="selectedSites.includes(site.id)" icon="fasl fa-check" color="primary" size="14" />
                  </template>
                </VListItem>
              </VList>
            </VMenu>
          </div>
          <div>
            <VMenu location="bottom start">
              <template #activator="{ props: menuProps }">
                <VTextField
                  :model-value="selectedRoleLabel"
                  readonly
                  label="Role"
                  density="comfortable"
                  v-bind="menuProps"
                  :rules="[() => !!role || 'Role is required']"
                >
                  <template #prepend-inner>
                    <VIcon :icon="roleOptions.find(option => option.value === role)?.icon || 'fasl fa-user'" color="secondary" />
                  </template>
                  <template #append-inner>
                    <VIcon icon="fasl fa-chevron-down" color="secondary" />
                  </template>
                </VTextField>
              </template>
              <VList density="compact" max-width="400" max-height="300">
                <VListItem
                  v-for="roleOption in roleOptions"
                  :key="roleOption.value"
                  :active="role === roleOption.value"
                  @click="role = roleOption.value"
                >
                  <template #prepend>
                    <VIcon :icon="roleOption.icon" class="fs-14" color="secondary" />
                  </template>
                  <div class="d-flex flex-column">
                    <span class="font-weight-medium">{{ roleOption.title }}</span>
                    <span class="text-body-2 text-medium-emphasis">{{ roleOption.subtitle }}</span>
                  </div>
                  <template #append>
                    <VIcon v-if="role === roleOption.value" icon="fasl fa-check" color="primary" size="14" />
                  </template>
                </VListItem>
              </VList>
            </VMenu>
          </div>
        </div>
      </VCardText>
      <VDivider />
      <VCardActions class="bg-surface-light">
        <VSpacer />
        <BaseButton text="Cancel" color="default" variant="flat" type="reset" :slim="false" @click="handleCancel" />
        <BaseButton
          text="Add user"
          color="success"
          variant="flat"
          type="submit"
          :disabled="!email || isLoading"
          :slim="false"
          :loading="isLoading"
        />
      </VCardActions>
    </VForm>
  </BaseDialog>
</template>
