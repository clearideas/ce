<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseActions from '../../base/BaseActions.vue'
import NewUser from './NewUser.vue'
import NewUserDialogContainer from './NewUserDialogContainer.vue'
import NewUserGroup from './NewUserGroup.vue'
import RefreshUsers from './RefreshUsers.vue'
import UserGroupDialog from './UserGroupDialog.vue'

interface Props {
  siteId?: string
}

const props = withDefaults(defineProps<Props>(), {})
const emit = defineEmits<{ interact: [] }>()

const newUserDialogVisible = ref(false)
const newUserUpgradeDialogVisible = ref(false)
const newUserGroupDialogVisible = ref(false)

watch(newUserDialogVisible, isVisible => {
  if (isVisible) emit('interact')
})

watch(newUserUpgradeDialogVisible, isVisible => {
  if (isVisible) emit('interact')
})

watch(newUserGroupDialogVisible, isVisible => {
  if (isVisible) emit('interact')
})
</script>

<template>
  <BaseActions>
    <template #primary="{ isNarrow }">
      <NewUser
        :show-sites="props.siteId ? false : true"
        :show-as-menu="false"
        :site-id="props.siteId"
        v-model:dialog="newUserDialogVisible"
        v-model:upgrade-dialog="newUserUpgradeDialogVisible"
        :text="isNarrow ? '' : 'Add user'"
        :icon="isNarrow ? 'fasl fa-user-plus' : undefined"
        :size="isNarrow ? 'small' : undefined"
      />
    </template>

    <NewUserGroup
      v-if="!props.siteId"
      :show-as-menu="false"
      v-model:dialog="newUserGroupDialogVisible"
    />
    <RefreshUsers :site-id="props.siteId" />

    <template #narrow>
      <RefreshUsers v-if="props.siteId" :site-id="props.siteId" size="small" />
      <Tippy v-else content="More" placement="top">
        <VBtn icon="fasl fa-ellipsis" size="small" variant="text" aria-label="More">
          <VIcon>fasl fa-ellipsis-vertical</VIcon>
          <VMenu offset-y activator="parent" text="More">
            <VList density="compact" nav>
              <NewUserGroup
                show-as-menu
                v-model:dialog="newUserGroupDialogVisible"
              />
              <RefreshUsers :site-id="props.siteId" show-as-menu />
            </VList>
          </VMenu>
        </VBtn>
      </Tippy>
    </template>

    <template #persistent>
      <NewUserDialogContainer
        v-model:is-dialog-visible="newUserDialogVisible"
        v-model:is-upgrade-dialog-visible="newUserUpgradeDialogVisible"
        :show-sites="props.siteId ? false : true"
        :site-id="props.siteId"
        :existing-users-only="false"
      />
      <UserGroupDialog v-model:is-dialog-visible="newUserGroupDialogVisible" :is-new="true" />
    </template>
  </BaseActions>
</template>
