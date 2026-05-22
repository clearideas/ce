<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { VForm } from 'vuetify/components'
import BaseButton from '../../base/BaseButton.vue'
import BaseDialog from '../../base/BaseDialog.vue'
import { useUserStore } from '../../../stores'

const props = withDefaults(defineProps<{ isNew?: boolean; userGroupId?: string }>(), {
  isNew: false,
  userGroupId: undefined,
})

const isDialogVisible = defineModel<boolean>('isDialogVisible', { required: true })
const userStore = useUserStore()
const refForm = ref<VForm>()
const name = ref('')
const loading = ref(false)
const title = computed(() => props.isNew ? 'New user group' : 'Edit user group')

function handleCancel() {
  isDialogVisible.value = false
  name.value = ''
}

async function loadContent() {
  if (props.isNew) {
    name.value = ''
    return
  }
  if (!props.userGroupId) return
  const userGroup = userStore.userGroups.find(group => group.id === props.userGroupId)
  if (!userGroup) return
  name.value = userGroup.name
}

watch(() => [props.isNew, props.userGroupId, isDialogVisible.value], async () => {
  if (isDialogVisible.value) await loadContent()
})

onMounted(loadContent)

async function createOrUpdateUserGroup() {
  const validation = await refForm.value?.validate()
  if (!validation?.valid) return
  loading.value = true
  try {
    if (props.isNew) await userStore.createUserGroup({ name: name.value })
    handleCancel()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="isDialogVisible" width="500" :title="title">
    <VForm ref="refForm" @submit.prevent="createOrUpdateUserGroup">
      <VCardText>
        <div>
          <VTextField
            v-model="name"
            label="Name"
            autofocus
            maxlength="100"
            :rules="[(value: string) => !!String(value || '').trim() || 'Name is required']"
          />
        </div>
      </VCardText>
      <VDivider />
      <VCardActions class="bg-surface-light">
        <VSpacer />
        <BaseButton
          :text="props.isNew ? 'Cancel' : 'Close'"
          color="default"
          type="reset"
          variant="flat"
          :slim="false"
          @click="handleCancel"
        />
        <BaseButton
          :text="props.isNew ? 'Create group' : 'Update group'"
          color="success"
          type="submit"
          variant="flat"
          density="default"
          :disabled="!name.trim()"
          :loading="loading"
          :slim="false"
        />
      </VCardActions>
    </VForm>
  </BaseDialog>
</template>
