<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDisplay } from 'vuetify'
import ContentListLoadingState from '../base/ContentListLoadingState.vue'
import TableFooter from '../base/TableFooter.vue'
import ContentListItem from '../content/ContentListItem.vue'
import { useProfileStore, useUserStore } from '../../stores'
import NewUserGroup from './actions/NewUserGroup.vue'
import UserGroupInfoIcons from './UserGroupInfoIcons.vue'
import type { UserGroup } from '../../types/domain'

interface UserGroupHeader {
  title: string
  key: string
  mobileHide?: boolean
}

const userStore = useUserStore()
const profileStore = useProfileStore()
const { mobile } = useDisplay()
const page = ref(1)

const items = computed<UserGroup[]>(() => userStore.userGroups ?? [])
const headers = computed<UserGroupHeader[]>(() => [{ title: 'Name', key: 'name' }])
const computedHeaders = computed(() => mobile.value ? headers.value.filter(header => !header.mobileHide) : headers.value)
const loading = computed(() => !!userStore.loadingUserGroups)
const rowProps = () => ({ class: 'data-table-item' })

async function loadUserGroups() {
  await userStore.getUserGroups()
}

onMounted(loadUserGroups)
</script>

<template>
  <div class="data-table-wrapper">
    <VDataTable
      v-model:page="page"
      v-model:items-per-page="profileStore.userGroupPageSize"
      density="comfortable"
      :items="items"
      item-value="id"
      :loading="loading"
      :sort-by="[{ key: 'name', order: 'asc' }]"
      :headers="computedHeaders"
      show-expand
      :class="items.length === 0 && !loading ? 'no-data' : ''"
      :row-props="rowProps"
    >
      <template #item.name="{ item }">
        <ContentListItem :text="item.name">
          <template #subtitle>
            {{ `${item.members?.length ?? item.users?.length ?? 0} members` }}
          </template>
          <template #prepend>
            <VIcon :icon="(item.icon && `fasl ${item.icon}`) || 'fasl fa-user-group'" />
          </template>
          <template #append>
            <UserGroupInfoIcons :item="item" />
          </template>
        </ContentListItem>
      </template>
      <template #item.members="{ item }">
        {{ `${item.members?.length ?? item.users?.length ?? 0} members` }}
      </template>
      <template #expanded-row="{ columns, item }">
        <tr class="data-table-item expanded-row">
          <td :colspan="columns.length" class="pb-4">
            <div class="d-flex flex-wrap ga-2 mx-2">
              <VChip
                v-for="user in item.members ?? []"
                :key="user.id || user.email"
                density="comfortable"
                closable
                color="default"
                @click:close="userStore.removeUsersFromGroup(item.id, user.id)"
              >
                {{ user.displayName ?? user.email }}
              </VChip>
            </div>
          </td>
        </tr>
      </template>
      <template #loading>
        <ContentListLoadingState :rows="10" variant="group" :show-checkbox="false" />
      </template>
      <template #bottom />
      <template #no-data>
        <VEmptyState title="No user groups" justify="center" min-height="55vh">
          <template #media>
            <VIcon icon="fasds fa-user-group" color="info" />
          </template>
          <template #text>
            <p class="text-medium-emphasis">Create groups to manage site access in reusable sets.</p>
          </template>
          <template #actions>
            <NewUserGroup
              :show-as-menu="false"
              variant="flat"
              size="large"
              rounded
              density="default"
              color="info"
            />
          </template>
        </VEmptyState>
      </template>
    </VDataTable>
  </div>
  <TableFooter
    v-model:page="page"
    v-model:items-per-page="profileStore.userGroupPageSize"
    :items="items"
    item-label="Groups"
  />
</template>

<style scoped>
.data-table-wrapper :deep(.v-data-table-progress) {
  display: none;
}

.data-table-wrapper :deep(.v-data-table-rows-loading),
.data-table-wrapper :deep(.v-data-table-rows-loading td),
.data-table-wrapper :deep(.v-data-table-rows-loading .v-data-table__td) {
  vertical-align: middle !important;
}

.data-table-wrapper :deep(.v-data-table-rows-loading > td),
.data-table-wrapper :deep(.v-data-table-rows-loading .v-data-table__td) {
  padding: 0 !important;
}

.data-table-wrapper :deep(.v-data-table-rows-loading .content-list-loading-state) {
  margin: 0 !important;
}
</style>
