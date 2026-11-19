<script setup lang="ts">
import { ref, watch } from 'vue'
import type { VForm } from 'vuetify/components'
import BaseDialog from '../../base/BaseDialog.vue'
import { useUserStore } from '../../../stores'

/** Creates a user group. (The CE API has no rename endpoint, so there is no edit mode.) */
const isDialogVisible = defineModel<boolean>({ required: true })
const userStore = useUserStore()
const refForm = ref<VForm>()
const name = ref('')
const loading = ref(false)

function handleCancel() {
  isDialogVisible.value = false
  name.value = ''
}

watch(isDialogVisible, visible => {
  if (visible) name.value = ''
})

async function createUserGroup() {
  const validation = await refForm.value?.validate()
  if (!validation?.valid) return
  loading.value = true
  try {
    await userStore.createUserGroup({ name: name.value.trim() })
    handleCancel()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="isDialogVisible"
    width="500"
    title="New user group"
    form="user-group-form"
    confirm-text="Create group"
    :confirm-disabled="!name.trim()"
    :loading="loading"
    @cancel="handleCancel"
  >
    <VForm id="user-group-form" ref="refForm" @submit.prevent="createUserGroup">
      <VCardText>
        <VTextField
          v-model="name"
          label="Name"
          autofocus
          maxlength="100"
          :rules="[(value: string) => !!String(value || '').trim() || 'Name is required']"
        />
      </VCardText>
    </VForm>
  </BaseDialog>
</template>
