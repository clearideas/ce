<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { VForm } from 'vuetify/components/VForm'
import BaseDialog from '../../base/BaseDialog.vue'
import { useSiteStore } from '../../../stores'
import type { Site } from '../../../types/domain'

const props = withDefaults(defineProps<{ modelValue?: boolean; redirectOnCreate?: boolean }>(), {
  modelValue: false,
  redirectOnCreate: true,
})
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; siteCreated: [site?: Site] }>()
const siteStore = useSiteStore()
const router = useRouter()
const refSiteForm = ref<VForm>()
const siteData = ref({ name: '' })
const isCreatingSite = ref(false)
const isDialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

async function addSite() {
  const validation = await refSiteForm.value?.validate()
  if (!validation?.valid) return
  isCreatingSite.value = true
  try {
    const site = await siteStore.createSite(siteData.value.name)
    isDialogVisible.value = false
    siteData.value.name = ''
    if (props.redirectOnCreate && site?.id) await router.push(`/site/${site.id}`)
    emit('siteCreated', site)
  } finally {
    isCreatingSite.value = false
  }
}

watch(isDialogVisible, value => {
  if (value) siteData.value.name = ''
})
</script>

<template>
  <BaseDialog
    v-model="isDialogVisible"
    width="500"
    title="New site"
    :loading="isCreatingSite"
    form="new-site-form"
    confirm-text="Create site"
    :confirm-disabled="!siteData.name"
  >
    <div v-if="isCreatingSite">
      <VList class="py-8" color="primary" elevation="12" rounded="lg">
        <VListItem prepend-icon="fas fa-building" :title="`Creating ${siteData.name}`">
          <template #append
            ><VProgressCircular
              aria-label="Creating site"
              color="primary"
              indeterminate="disable-shrink"
              width="6"
          /></template>
        </VListItem>
      </VList>
    </div>
    <VForm v-else id="new-site-form" ref="refSiteForm" @submit.prevent="addSite">
      <VCardText>
        <VTextField
          v-model="siteData.name"
          label="Name"
          :rules="[v => !!v || 'Name is required']"
          autofocus
          validate-on="blur"
          maxlength="100"
        />
      </VCardText>
    </VForm>
  </BaseDialog>
</template>
