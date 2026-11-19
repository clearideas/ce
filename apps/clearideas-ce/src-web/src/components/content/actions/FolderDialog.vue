<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { VForm } from 'vuetify/components/VForm'
import BaseDialog from '../../base/BaseDialog.vue'
import { useContentStore } from '../../../stores'

interface Props {
  siteId: string
  folderId?: string
  isNew?: boolean
}

const props = withDefaults(defineProps<Props>(), { isNew: true, folderId: undefined })
const isDialogVisible = defineModel<boolean>({ required: true })
const contentStore = useContentStore()
const refForm = ref<VForm>()
const name = ref('')
const saving = ref(false)
const title = computed(() => (props.isNew ? 'New folder' : 'Edit folder'))
function handleCancel() {
  isDialogVisible.value = false
  name.value = ''
}

watch(isDialogVisible, value => {
  if (value && props.isNew) name.value = ''
})

async function createOrUpdateFolder() {
  const validation = await refForm.value?.validate()
  if (!validation?.valid) return
  if (!props.isNew) return
  saving.value = true
  try {
    await contentStore.createFolder(props.siteId, name.value, props.folderId)
    handleCancel()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="isDialogVisible"
    width="500"
    :title="title"
    form="folder-form"
    :confirm-text="props.isNew ? 'Create folder' : 'Save'"
    :confirm-disabled="!name"
    :loading="saving"
    @cancel="handleCancel"
  >
    <VForm id="folder-form" ref="refForm" @submit.prevent="createOrUpdateFolder">
      <VCardText>
        <VTextField
          v-model="name"
          label="Name"
          :rules="[v => !!v || 'Name is required']"
          autofocus
          maxlength="500"
        />
      </VCardText>
    </VForm>
  </BaseDialog>
</template>
