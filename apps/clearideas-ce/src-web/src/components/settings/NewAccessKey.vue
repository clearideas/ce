<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { VForm } from 'vuetify/components/VForm'
import BaseButton from '../base/BaseButton.vue'
import BaseDialog from '../base/BaseDialog.vue'
import IconCheckbox from '../base/IconCheckbox.vue'
import { useAccessKeyStore } from '../../stores'

type AccessKeyType = 'mcp'
type AccessKeyScope = string

type AccessKeyCreateParams = {
  name: string
  description: string
  keyType: AccessKeyType
  scopes: AccessKeyScope[]
  expiresIn?: number
}

interface Props {
  text?: string
  color?: string
  size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
  variant?: 'flat' | 'outlined' | 'elevated' | 'tonal' | 'text' | 'plain'
  prependIcon?: string
}

const props = withDefaults(defineProps<Props>(), {
  text: undefined,
  color: 'primary',
  size: 'small',
  variant: 'flat',
  prependIcon: 'fasl fa-plus',
})

const emit = defineEmits<{ keyCreated: [] }>()

const accessKeyStore = useAccessKeyStore()
const { creatingKey, keyTypes } = storeToRefs(accessKeyStore)
const isDialogVisible = ref(false)
const refForm = ref<VForm>()

const scopeDescriptions: Record<string, { label: string; description: string }> = {
  'mcp:read': {
    label: 'Read MCP context',
    description: 'Allows MCP clients to retrieve Clear Ideas CE context.',
  },
  'mcp:write': {
    label: 'Write MCP context',
    description: 'Allows MCP clients to create or update supported CE context.',
  },
}

const createForm = ref<AccessKeyCreateParams>({
  name: '',
  description: '',
  keyType: 'mcp',
  scopes: [],
  expiresIn: 365 * 24 * 60 * 60 * 1000,
})

const isFormValid = computed(() => createForm.value.name.trim() && createForm.value.keyType && createForm.value.scopes.length > 0)

function getAvailableScopes(keyType: AccessKeyType) {
  const availableScopes = keyTypes.value[keyType] || []
  return availableScopes.map(scope => ({
    value: scope,
    label: scopeDescriptions[scope]?.label || scope,
    description: scopeDescriptions[scope]?.description || `Allow ${scope} access.`,
  }))
}

function onKeyTypeChange() {
  createForm.value.scopes = []
}

function resetForm() {
  createForm.value = {
    name: '',
    description: '',
    keyType: 'mcp',
    scopes: [],
    expiresIn: 365 * 24 * 60 * 60 * 1000,
  }
}

async function handleCreateKey() {
  const validation = await refForm.value?.validate()
  if (!validation?.valid) return
  await accessKeyStore.createAccessKey(createForm.value)
  if (!accessKeyStore.error) {
    isDialogVisible.value = false
    resetForm()
    emit('keyCreated')
  }
}

function closeDialog() {
  isDialogVisible.value = false
  resetForm()
}

onMounted(() => {
  void accessKeyStore.fetchKeyTypes()
})
</script>

<template>
  <BaseButton
    v-bind="props"
    :text="props.text || 'Create access key'"
    @click="isDialogVisible = true"
    :disabled="creatingKey"
    rounded
  />

  <BaseDialog
    v-model="isDialogVisible"
    max-width="600"
    persistent
    :title="creatingKey ? '' : 'Create access key'"
    :show-close="!creatingKey"
  >
    <div v-if="creatingKey">
      <VList class="py-8" color="primary" elevation="12" rounded="lg">
        <VListItem prepend-icon="fasl fa-key" :title="`Creating ${createForm.name}`">
          <template #prepend>
            <div class="pe-4"><VIcon color="primary" size="x-large" /></div>
          </template>
          <template #append><VProgressCircular color="primary" indeterminate width="6" /></template>
        </VListItem>
      </VList>
    </div>

    <template v-else>
      <VForm ref="refForm" @submit.prevent="handleCreateKey">
        <VCardText>
          <div class="d-flex flex-column ga-4">
            <VTextField
              v-model="createForm.name"
              label="Name"
              placeholder="Production MCP key"
              :rules="[value => !!value || 'Name is required']"
              maxlength="100"
              variant="outlined"
              density="compact"
              autofocus
              rounded
            />

            <VTextarea
              v-model="createForm.description"
              label="Description (optional)"
              placeholder="Describe where this key will be used"
              maxlength="500"
              variant="outlined"
              density="compact"
              rows="2"
            />

            <VSelect
              v-model="createForm.keyType"
              label="Key type"
              :items="[
                { value: 'mcp', title: 'MCP' },
              ]"
              :rules="[value => !!value || 'Key type is required']"
              variant="outlined"
              density="compact"
              rounded
              @update:model-value="onKeyTypeChange"
            />

            <div>
              <div class="mb-2">
                <label class="text-subtitle-2">Permissions <span class="text-error text-caption">(required)</span></label>
              </div>

              <div class="scope-options">
                <div v-for="scope in getAvailableScopes(createForm.keyType)" :key="scope.value" class="scope-option mb-2">
                  <IconCheckbox v-model="createForm.scopes" :id="scope.value" :label="scope.label" :size="16" />
                  <div class="text-caption text-medium-emphasis ml-6">{{ scope.description }}</div>
                </div>
              </div>
            </div>

            <VSelect
              v-model="createForm.expiresIn"
              label="Expiration"
              :items="[
                { value: undefined, title: 'Never' },
                { value: 2 * 24 * 60 * 60 * 1000, title: '2 days' },
                { value: 7 * 24 * 60 * 60 * 1000, title: '7 days' },
                { value: 30 * 24 * 60 * 60 * 1000, title: '30 days' },
                { value: 90 * 24 * 60 * 60 * 1000, title: '90 days' },
                { value: 365 * 24 * 60 * 60 * 1000, title: '1 year' },
              ]"
              variant="outlined"
              density="compact"
              rounded
            />
          </div>
        </VCardText>

        <VDivider />

        <VCardActions class="bg-surface-light">
          <VSpacer />
          <BaseButton text="Cancel" color="default" variant="flat" rounded @click="closeDialog" />
          <BaseButton text="Create key" color="primary" variant="flat" rounded type="submit" :disabled="!isFormValid" />
        </VCardActions>
      </VForm>
    </template>
  </BaseDialog>
</template>

<style scoped>
.scope-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scope-option {
  display: flex;
  flex-direction: column;
}
</style>
