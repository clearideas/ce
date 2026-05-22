<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import BaseDialog from '../../base/BaseDialog.vue'
import { useUserStore } from '../../../stores'

interface Props {
  userGroupId: string
  userGroupName: string
  buttonText?: string
  text?: string
  color?: string
  variant?: 'text' | 'flat' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  showAsMenu?: boolean
  showAsIcon?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showAsMenu: false,
  showAsIcon: false,
  buttonText: '',
  text: '',
  color: 'primary',
  variant: 'text',
})

const userStore = useUserStore()
const isDialogVisible = ref(false)
const selectedUsers = ref<string[]>([])
const availableUsers = ref<Array<{ id: string; email: string; displayName?: string; name?: string }>>([])
const loading = ref(false)
const loadingUsers = ref(false)
const filter = ref('')

const group = computed(() => userStore.userGroups.find(item => item.id === props.userGroupId))
const groupUserIds = computed(() => new Set((group.value?.users ?? []).map(id => String(id))))
const userOptions = computed(() => availableUsers.value
  .filter(user => !groupUserIds.value.has(user.id))
  .filter(user => {
    const q = filter.value.trim().toLowerCase()
    if (!q) return true
    return [user.displayName, user.name, user.email].some(value => String(value ?? '').toLowerCase().includes(q))
  })
  .map(user => ({
    title: user.displayName || user.name || user.email,
    subtitle: user.email,
    value: user.id,
  })))

function toggleDialog() {
  isDialogVisible.value = !isDialogVisible.value
}

function handleCancel() {
  selectedUsers.value = []
  filter.value = ''
  isDialogVisible.value = false
}

async function loadUsers() {
  loadingUsers.value = true
  try {
    availableUsers.value = await userStore.getUsers()
  } finally {
    loadingUsers.value = false
  }
}

async function addUsers() {
  if (selectedUsers.value.length === 0) return
  loading.value = true
  try {
    await userStore.addUsersToGroup(props.userGroupId, selectedUsers.value)
    handleCancel()
  } finally {
    loading.value = false
  }
}

watch(isDialogVisible, async value => {
  if (value) await loadUsers()
})
</script>

<template>
  <BaseButton
    v-if="!!!props.showAsMenu && !!!props.showAsIcon"
    :color="props.color"
    prepend-icon="fasl fa-user-plus"
    :variant="props.variant ?? 'plain'"
    density="comfortable"
    slim
    class="px-4"
    :text="props.buttonText || 'Add user to group'"
    @click="toggleDialog"
  />
  <VIcon
    v-if="!!props.showAsIcon"
    :color="props.color"
    icon="fass fa-user-plus"
    aria-label="Add user to group"
    @click="toggleDialog"
  />
  <VListItem
    v-if="props.showAsMenu"
    prepend-icon="fasl fa-user-plus"
    density="compact"
    @click.stop="toggleDialog"
  >
    <VListItemTitle>{{ props.text || 'Add user to group' }}</VListItemTitle>
  </VListItem>

  <BaseDialog v-model="isDialogVisible" width="500" :title="`Add users to ${props.userGroupName}`">
    <VCardText>
      <VTextField
        v-model="filter"
        label="Users"
        autofocus
        clearable
        hide-details="auto"
        :loading="loadingUsers"
      />
      <div class="chips mt-3">
        <VChip
          v-for="userId in selectedUsers"
          :key="userId"
          closable
          size="small"
          @click:close="selectedUsers = selectedUsers.filter(id => id !== userId)"
        >
          {{ userOptions.find(user => user.value === userId)?.title ?? userId }}
        </VChip>
      </div>
      <VList class="mt-3 add-user-to-group-list" density="compact" nav>
        <VListItem v-if="!loadingUsers && userOptions.length === 0">
          <VListItemTitle>No users available to add</VListItemTitle>
        </VListItem>
        <VListItem
          v-for="user in userOptions"
          :key="user.value"
          :title="user.title"
          :subtitle="user.subtitle"
          @click="selectedUsers = selectedUsers.includes(user.value) ? selectedUsers.filter(id => id !== user.value) : [...selectedUsers, user.value]"
        >
          <template #prepend>
            <VCheckboxBtn :model-value="selectedUsers.includes(user.value)" />
          </template>
        </VListItem>
      </VList>
    </VCardText>
    <VDivider />
    <VCardActions class="bg-surface-light">
      <VSpacer />
      <BaseButton text="Cancel" color="default" type="reset" variant="flat" :slim="false" @click="handleCancel" />
      <BaseButton
        text="Add users"
        color="success"
        type="submit"
        variant="flat"
        density="default"
        :disabled="selectedUsers.length === 0"
        :loading="loading"
        :slim="false"
        @click="addUsers"
      />
    </VCardActions>
  </BaseDialog>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 28px;
}

.add-user-to-group-list {
  max-height: 280px;
  overflow: auto;
}
</style>
