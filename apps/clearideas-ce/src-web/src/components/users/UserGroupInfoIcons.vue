<script setup lang="ts">
import { ref } from 'vue'
import type { UserGroup } from '../../types/domain'
import AddUserToGroup from './actions/AddUserToGroup.vue'
import UserGroupDialog from './actions/UserGroupDialog.vue'

interface Props {
  item: UserGroup
}

const props = defineProps<Props>()
const currentUserGroupId = ref<string | undefined>()
const isDialogVisible = ref(false)

function editUserGroup(id: string) {
  currentUserGroupId.value = id
  isDialogVisible.value = true
}
</script>

<template>
  <div class="info-icons">
    <div v-tippy="{ content: 'Edit user group' }" class="info-icon">
      <VIcon color="primary" icon="fasds fa-pen-to-square" aria-label="Edit user group" @click="editUserGroup(props.item.id)" />
    </div>
    <div v-tippy="{ content: 'Add user to group' }" class="info-icon">
      <AddUserToGroup
        button-text="Add user to group"
        :user-group-id="props.item.id"
        color="success"
        :show-as-icon="true"
        :show-as-menu="false"
        :text="`Add users to ${props.item.name}`"
        :user-group-name="props.item.name"
      />
    </div>
    <UserGroupDialog
      v-model:is-dialog-visible="isDialogVisible"
      :is-new="false"
      :user-group-id="currentUserGroupId"
    />
  </div>
</template>
