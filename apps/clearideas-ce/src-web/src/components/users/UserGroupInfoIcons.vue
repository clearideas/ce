<script setup lang="ts">
import type { UserGroup } from '../../types/domain'
import AddUserToGroup from './actions/AddUserToGroup.vue'

/**
 * Row actions for a user group. (Renaming is not offered: the CE API has no endpoint for it, and
 * the former "Edit user group" dialog could only be closed.)
 */
defineProps<{ item: UserGroup }>()
</script>

<template>
  <div class="info-icons">
    <div class="info-icon">
      <AddUserToGroup :user-group-id="item.id" :user-group-name="item.name" show-as-icon />
    </div>
  </div>
</template>
