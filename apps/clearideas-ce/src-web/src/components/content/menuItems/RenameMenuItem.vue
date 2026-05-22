<script setup lang="ts">
import { ref } from 'vue'
import { VForm } from 'vuetify/components/VForm'
import BaseButton from '../../base/BaseButton.vue'
import BaseDialog from '../../base/BaseDialog.vue'
import { useContentStore } from '../../../stores'

interface Props {
  id: string
  siteId: string
}

const props = defineProps<Props>()
const name = defineModel<string>()

const tempName = ref('')
const contentStore = useContentStore()
const isRenameContentDialogVisible = ref(false)
const contentForm = ref<VForm>()

async function updateContent() {
  const validation = await contentForm.value?.validate()
  if (!validation?.valid) return

  const existingContent: any = contentStore.contents.find(item => item.id === props.id)
  await contentStore.updateContent(props.siteId, props.id, { name: tempName.value })
  if (existingContent != null) existingContent.name = tempName.value
  name.value = tempName.value
  isRenameContentDialogVisible.value = false
}

function onDialogOpen() {
  tempName.value = name.value || ''
}

const handleClick = () => {
  isRenameContentDialogVisible.value = true
  onDialogOpen()
}
</script>

<template>
  <VListItem density="compact" @click.stop="handleClick">
    <VListItemTitle>Rename</VListItemTitle>
  </VListItem>
  <BaseDialog
    v-model="isRenameContentDialogVisible"
    width="500"
    title="Rename"
  >
    <VForm ref="contentForm" @submit.prevent="updateContent">
      <VCardText>
        <div>
          <VTextField
            v-model="tempName"
            label="Name"
            :rules="[v => !!v || 'Name is required']"
            maxlength="500"
          />
        </div>
      </VCardText>
      <VDivider />
      <VCardActions class="bg-surface-light">
        <VSpacer />
        <BaseButton
          text="Cancel"
          color="default"
          type="reset"
          variant="flat"
          :slim="false"
          @click="isRenameContentDialogVisible = false"
        />
        <BaseButton
          text="Rename"
          color="success"
          type="submit"
          variant="flat"
          density="default"
          :disabled="!tempName"
          :slim="false"
        />
      </VCardActions>
    </VForm>
  </BaseDialog>
</template>
