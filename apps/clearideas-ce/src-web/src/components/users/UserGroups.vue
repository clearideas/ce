<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDisplay } from 'vuetify'
import ContentListLoadingState from '../base/ContentListLoadingState.vue'
import TableFooter from '../base/TableFooter.vue'
import ContentListItem from '../content/ContentListItem.vue'
import { useUserStore } from '../../stores'
import NewUserGroup from './actions/NewUserGroup.vue'
import UserGroupInfoIcons from './UserGroupInfoIcons.vue'
import type { UserGroup } from '../../types/domain'
import EmptyState from '../base/EmptyState.vue'
import LoadError from '../base/LoadError.vue'
import { errorMessage } from '../../utils/errors'
import { usePreferences } from '../../composables/usePreferences'

interface UserGroupHeader {
  title: string
  key: string
  mobileHide?: boolean
}

const userStore = useUserStore()
const { preferences } = usePreferences()
const { mobile } = useDisplay()
const page = ref(1)

const items = computed<UserGroup[]>(() => userStore.userGroups ?? [])
const headers = computed<UserGroupHeader[]>(() => [{ title: 'Name', key: 'name' }])
const computedHeaders = computed(() =>
  mobile.value ? headers.value.filter(header => !header.mobileHide) : headers.value,
)
const loading = computed(() => !!userStore.loadingUserGroups)
const rowProps = () => ({ class: 'data-table-item' })

/** Why the list could not be loaded (shown instead of "No user groups"); '' when it loaded. */
const loadError = ref('')

async function loadUserGroups() {
  loadError.value = ''
  try {
    await userStore.getUserGroups()
  } catch (error) {
    loadError.value = errorMessage(error, 'User groups could not be loaded.')
  }
}

onMounted(loadUserGroups)
</script>

<template>
  <div class="data-table-wrapper">
    <VDataTable
      v-model:page="page"
      v-model:items-per-page="preferences.userGroupPageSize"
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
            <VIcon :icon="(item.icon && `fas ${item.icon}`) || 'fas fa-user-group'" />
          </template>
          <template #append>
            <UserGroupInfoIcons :item="item" />
          </template>
        </ContentListItem>
      </template>
      <template #item.members="{ item }">
        {{ `${item.members?.length ?? item.users?.length ?? 0} members` }}
      </template>
      <template #item.data-table-expand="{ props: expandProps, item, internalItem, isExpanded }">
        <!-- Vuetify's expand toggle is an unnamed icon button; name it for the row it belongs to. -->
        <VBtn
          v-bind="expandProps"
          :aria-label="`${isExpanded(internalItem) ? 'Hide' : 'Show'} members of ${item.name}`"
          :aria-expanded="isExpanded(internalItem)"
        />
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
        <LoadError v-if="loadError" :message="loadError" @retry="loadUserGroups" />
        <EmptyState
          v-else
          icon="fas fa-user-group"
          title="No user groups"
          text="Create groups to manage site access in reusable sets."
        >
          <template #actions>
            <NewUserGroup :show-as-menu="false" intent="primary" />
          </template>
        </EmptyState>
      </template>
    </VDataTable>
  </div>
  <TableFooter
    v-model:page="page"
    v-model:items-per-page="preferences.userGroupPageSize"
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
  vertical-align: middle;
}

.data-table-wrapper :deep(.v-data-table-rows-loading > td),
.data-table-wrapper :deep(.v-data-table-rows-loading .v-data-table__td) {
  padding: 0;
}

.data-table-wrapper :deep(.v-data-table-rows-loading .content-list-loading-state) {
  margin: 0;
}
</style>
