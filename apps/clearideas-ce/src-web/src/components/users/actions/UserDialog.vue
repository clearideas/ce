<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { VForm } from 'vuetify/components'
import BaseDialog from '../../base/BaseDialog.vue'
import ContentListItem from '../../content/ContentListItem.vue'
import { useSiteStore, useUserStore } from '../../../stores'
import { ASSIGNABLE_SITE_ROLES } from '../../../config/roles'
import { getVuetifyItemRaw } from '../../../utils/vuetify'

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

const isDialogVisible = defineModel<boolean>({ required: true })
const userStore = useUserStore()
const siteStore = useSiteStore()
const refForm = ref<VForm>()
const email = ref('')
const displayName = ref('')
const selectedSites = ref<string[]>([])
const role = ref('viewer')
const isLoading = ref(false)
const dialogTitle = computed(() => props.title || 'Add user')
const filteredSites = computed(() =>
  siteStore.sites.filter(site => site.currentUserRole === 'owner' || site.currentUserRole === 'admin'),
)
const siteOptions = computed(() =>
  filteredSites.value.map(site => ({
    title: site.name,
    value: site.id,
    icon: (site.icon && `fas ${site.icon}`) || 'fas fa-folder-open',
  })),
)
const selectedSitesLabel = computed(() =>
  selectedSites.value.length > 0 ? `${selectedSites.value.length} sites selected` : 'Select sites',
)
const roleOptions = ASSIGNABLE_SITE_ROLES
const siteOption = (item: unknown) => getVuetifyItemRaw<{ title: string; value: string; icon: string }>(item)
const roleOption = (item: unknown) => getVuetifyItemRaw<(typeof ASSIGNABLE_SITE_ROLES)[number]>(item)

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
  <BaseDialog
    v-model="isDialogVisible"
    width="500"
    :title="dialogTitle"
    form="user-form"
    confirm-text="Add user"
    :confirm-disabled="!email"
    :loading="isLoading"
    @cancel="handleCancel"
  >
    <VForm id="user-form" ref="refForm" @submit.prevent="addUser">
      <VCardText>
        <div class="d-flex flex-column ga-4">
          <VTextField
            v-model="email"
            label="Email"
            type="email"
            autofocus
            :rules="[(value: string) => /.+@.+\..+/.test(String(value || '')) || 'Valid email is required']"
          />
          <VTextField v-model="displayName" label="Name" maxlength="100" />
          <VSelect
            v-if="props.showSites && !props.siteId"
            v-model="selectedSites"
            :items="siteOptions"
            label="Sites"
            placeholder="Select sites"
            persistent-placeholder
            density="comfortable"
            multiple
            menu-icon="fas fa-chevron-down"
            :rules="[() => selectedSites.length > 0 || 'At least one site is required']"
          >
            <template #prepend-inner><VIcon icon="fas fa-building" color="secondary" /></template>
            <template #selection="{ index }">
              <span v-if="index === 0">{{ selectedSitesLabel }}</span>
            </template>
            <template #item="{ props: itemProps, item }">
              <VListItem v-bind="itemProps" :title="undefined">
                <ContentListItem :text="siteOption(item).title" :prepend-icon="siteOption(item).icon" />
              </VListItem>
            </template>
          </VSelect>
          <VSelect
            v-model="role"
            :items="roleOptions"
            item-title="title"
            item-value="value"
            label="Role"
            density="comfortable"
            menu-icon="fas fa-chevron-down"
            :rules="[() => !!role || 'Role is required']"
          >
            <template #prepend-inner>
              <VIcon
                :icon="roleOptions.find(option => option.value === role)?.icon || 'fas fa-user'"
                color="secondary"
              />
            </template>
            <template #item="{ props: itemProps, item }">
              <VListItem
                v-bind="itemProps"
                :subtitle="roleOption(item).subtitle"
                :prepend-icon="roleOption(item).icon"
              />
            </template>
          </VSelect>
        </div>
      </VCardText>
    </VForm>
  </BaseDialog>
</template>
