<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { VForm } from 'vuetify/components/VForm'
import BaseButton from '../../base/BaseButton.vue'
import BaseDialog from '../../base/BaseDialog.vue'
import { useContentStore } from '../../../stores'

interface Props {
  siteId: string
  folderId?: string
  isNew?: boolean
  isDialogVisible?: boolean
}

const props = withDefaults(defineProps<Props>(), { isNew: true, folderId: undefined, isDialogVisible: false })
const emit = defineEmits<{ 'update:isDialogVisible': [value: boolean] }>()
const contentStore = useContentStore()
const refForm = ref<VForm>()
const name = ref('')
const isDialogVisible = computed({
  get: () => props.isDialogVisible,
  set: value => emit('update:isDialogVisible', value),
})
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
  if (props.isNew) {
    await contentStore.createFolder(props.siteId, name.value, props.folderId)
    handleCancel()
  }
}
</script>

<template>
  <BaseDialog v-model="isDialogVisible" width="500" :title="title">
    <VForm ref="refForm" @submit.prevent="createOrUpdateFolder">
      <VCardText>
        <VTextField v-model="name" label="Name" :rules="[v => !!v || 'Name is required']" autofocus maxlength="500" />
      </VCardText>
      <VDivider />
      <VCardActions class="bg-surface-light">
        <VSpacer />
        <BaseButton text="Cancel" color="default" type="reset" variant="flat" @click="handleCancel" />
        <BaseButton text="New folder" color="success" type="submit" variant="flat" density="default" :disabled="!name" />
      </VCardActions>
    </VForm>
  </BaseDialog>
</template>
