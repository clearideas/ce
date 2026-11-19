<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import BaseDialog from '../../base/BaseDialog.vue'
import IconCheckbox from '../../base/IconCheckbox.vue'
import { ICONS } from '../../../icons'
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
const userOptions = computed(() =>
  availableUsers.value
    .filter(user => !groupUserIds.value.has(user.id))
    .filter(user => {
      const q = filter.value.trim().toLowerCase()
      if (!q) return true
      return [user.displayName, user.name, user.email].some(value =>
        String(value ?? '')
          .toLowerCase()
          .includes(q),
      )
    })
    .map(user => ({
      title: user.displayName || user.name || user.email,
      subtitle: user.email,
      value: user.id,
    })),
)

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
    prepend-icon="fas fa-user-plus"
    :variant="props.variant ?? 'plain'"
    density="comfortable"
    slim
    class="px-4"
    :text="props.buttonText || 'Add user to group'"
    @click="toggleDialog"
  />
  <BaseButton
    v-if="props.showAsIcon"
    :icon="ICONS.add"
    intent="tertiary"
    color="success"
    size="small"
    density="comfortable"
    :tooltip="`Add users to ${props.userGroupName}`"
    :aria-label="`Add users to ${props.userGroupName}`"
    @click.stop="toggleDialog"
  />
  <VListItem
    v-if="props.showAsMenu"
    prepend-icon="fas fa-user-plus"
    density="compact"
    @click.stop="toggleDialog"
  >
    <VListItemTitle>{{ props.text || 'Add user to group' }}</VListItemTitle>
  </VListItem>

  <BaseDialog
    v-model="isDialogVisible"
    width="500"
    :title="`Add users to ${props.userGroupName}`"
    confirm-text="Add users"
    :confirm-disabled="selectedUsers.length === 0"
    :loading="loading"
    @confirm="addUsers"
    @cancel="handleCancel"
  >
    <VCardText>
      <VTextField
        v-model="filter"
        label="Filter users"
        autofocus
        clearable
        hide-details="auto"
        :loading="loadingUsers"
      />
      <p v-if="!loadingUsers && userOptions.length === 0" class="text-body-2 text-medium-emphasis mt-3 mb-0">
        No users available to add
      </p>
      <div v-else class="add-user-to-group-list mt-3" role="group" aria-label="Users">
        <IconCheckbox
          v-for="user in userOptions"
          :id="user.value"
          :key="user.value"
          v-model="selectedUsers"
          :label="user.title"
          :description="user.subtitle"
        />
      </div>
    </VCardText>
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
