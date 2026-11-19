<script setup lang="ts">
import { ref } from 'vue'
import BaseActions from '../../base/BaseActions.vue'
import NewUser from './NewUser.vue'
import UserDialog from './UserDialog.vue'
import NewUserGroup from './NewUserGroup.vue'
import RefreshUsers from './RefreshUsers.vue'
import UserGroupDialog from './UserGroupDialog.vue'

interface Props {
  siteId?: string
}

const props = withDefaults(defineProps<Props>(), {})

const newUserDialogVisible = ref(false)
const newUserGroupDialogVisible = ref(false)
</script>

<template>
  <BaseActions>
    <template #primary="{ isNarrow }">
      <NewUser
        v-model:dialog="newUserDialogVisible"
        :show-sites="props.siteId ? false : true"
        :show-as-menu="false"
        :site-id="props.siteId"
        :text="isNarrow ? '' : 'Add user'"
        :icon="isNarrow ? 'fas fa-user-plus' : undefined"
        :size="isNarrow ? 'small' : undefined"
      />
    </template>

    <NewUserGroup v-if="!props.siteId" v-model:dialog="newUserGroupDialogVisible" :show-as-menu="false" />
    <RefreshUsers :site-id="props.siteId" />

    <template #narrow>
      <RefreshUsers v-if="props.siteId" :site-id="props.siteId" size="small" />
      <Tippy v-else content="More" placement="top">
        <VBtn icon="fas fa-ellipsis" size="small" variant="text" aria-label="More">
          <VIcon>fas fa-ellipsis-vertical</VIcon>
          <VMenu offset-y activator="parent" text="More">
            <VList density="compact" nav>
              <NewUserGroup v-model:dialog="newUserGroupDialogVisible" show-as-menu />
              <RefreshUsers :site-id="props.siteId" show-as-menu />
            </VList>
          </VMenu>
        </VBtn>
      </Tippy>
    </template>

    <template #persistent>
      <UserDialog
        v-model="newUserDialogVisible"
        :show-sites="props.siteId ? false : true"
        :site-id="props.siteId"
        :existing-users-only="false"
      />
      <UserGroupDialog v-model="newUserGroupDialogVisible" />
    </template>
  </BaseActions>
</template>
