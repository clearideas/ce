<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { DateTime } from 'luxon'
import { useDisplay } from 'vuetify'
import Avatar from '../base/Avatar.vue'
import CompactInlineSelector from '../base/CompactInlineSelector.vue'
import ContentListLoadingState from '../base/ContentListLoadingState.vue'
import SiteSelectTags from '../base/SiteSelectTags.vue'
import TableFooter from '../base/TableFooter.vue'
import Tag from '../base/Tag.vue'
import ContentListItem from '../content/ContentListItem.vue'
import NewUser from './actions/NewUser.vue'
import UserItemMenu from './menuItems/UserItemMenu.vue'
import { useProfileStore, useSiteStore, useUserStore } from '../../stores'

const props = defineProps<{ siteId?: string }>()

const userStore = useUserStore()
const siteStore = useSiteStore()
const profileStore = useProfileStore()
const { mobile } = useDisplay()

const page = ref(1)
const expanded = ref<string[]>([])
const activeRoleMenuUserId = ref<string | null>(null)
const hasSite = computed(() => !!props.siteId)
const users = computed(() => hasSite.value ? userStore.siteUsers : userStore.users)
const items = computed(() => {
  if (hasSite.value) void userStore.siteUsersLastUpdated
  else void userStore.usersLastUpdated
  return users.value
})
const loading = computed(() => !!userStore.loadingSiteUsers || !!userStore.loadingUsers)

const roleOptions = [
  { title: 'Owner', subtitle: 'Full control', value: 'owner', icon: 'fasl fa-crown' },
  { title: 'Admin', subtitle: 'Manage users and content', value: 'admin', icon: 'fasl fa-user-shield' },
  { title: 'Editor', subtitle: 'Upload and manage content', value: 'editor', icon: 'fasl fa-pen-to-square' },
  { title: 'Uploader', subtitle: 'Upload content', value: 'uploader', icon: 'fasl fa-upload' },
  { title: 'Downloader', subtitle: 'Download content', value: 'downloader', icon: 'fasl fa-download' },
  { title: 'Viewer', subtitle: 'View and download content', value: 'viewer', icon: 'fasl fa-eye' },
  { title: 'Disabled', subtitle: 'No access', value: 'disabled', icon: 'fasl fa-user-slash' },
]

const headers = computed<any[]>(() => [
  { title: 'Name', key: 'displayName' },
  { title: 'Role', key: 'sites[0].role', mobileHide: false, hidden: true, hiddenWithSite: false },
  { title: 'Last active', key: 'lastActive', mobileHide: true },
])

const computedHeaders = computed(() => {
  const activeHeaders = hasSite.value
    ? headers.value.filter(header => !header.hiddenWithSite && !(header.hidden && header.hiddenWithSite !== false))
    : headers.value.filter(header => !header.hidden)
  return mobile.value ? activeHeaders.filter(header => !header.mobileHide) : activeHeaders
})

function userStatusToString(status: string) {
  return String(status || 'active').replaceAll('-', ' ')
}

function isNonActiveUser(item: any) {
  return String(item.status ?? 'active') !== 'active'
}

function isCurrentUser(item: any) {
  return (
    (!!profileStore.user?.id && String(item.id) === String(profileStore.user.id)) ||
    (!!profileStore.user?.email && String(item.email).toLowerCase() === String(profileStore.user.email).toLowerCase())
  )
}

function getUserStatusChipColor(status: string) {
  return String(status).includes('bounced') ? 'error' : undefined
}

function getUserStatusChipIcon(status: string) {
  return String(status).includes('bounced') ? 'fass fa-circle-exclamation' : 'fass fa-circle-envelope'
}

function getUserSiteRole(item: any) {
  return item.sites?.[0]?.role ?? item.roles?.[0] ?? 'member'
}

function getRoleDescription(role: string) {
  return roleOptions.find(roleOption => roleOption.value === role)
}

function isEditableRole(role: string) {
  return role !== 'owner'
}

function getReadOnlyRoleTooltip(role: string) {
  return role === 'owner' ? 'Site owner cannot be changed here.' : 'Role cannot be changed.'
}

function getLastActive(item: any) {
  return item.lastActive ? DateTime.fromISO(item.lastActive).toRelative() : ''
}

function toggleExpanded(id: string) {
  expanded.value = expanded.value.includes(id)
    ? expanded.value.filter(expandedId => expandedId !== id)
    : [...expanded.value, id]
}

const rowProps = (obj: { item?: { id?: string } }) => {
  const id = obj.item?.id
  return {
    class: !hasSite.value && id ? 'data-table-item data-table-item--expandable' : 'data-table-item',
    onClick: () => {
      if (hasSite.value || !id) return
      toggleExpanded(id)
    },
  }
}

async function updateSiteUser(_id: string, _role: string, _expiresAt: Date | null) {
  activeRoleMenuUserId.value = null
  if (props.siteId) await userStore.updateSiteUser(props.siteId, _id, _role, _expiresAt)
}

async function loadUsers() {
  if (hasSite.value) await userStore.getSiteUsers(props.siteId!)
  else await Promise.all([userStore.getUsers(), siteStore.getSitesIfRequired()])
}

watch(() => props.siteId, loadUsers)
onMounted(loadUsers)
</script>

<template>
  <div class="data-table-wrapper">
    <VDataTable
      v-model:page="page"
      v-model:items-per-page="profileStore.userPageSize"
      v-model:expanded="expanded"
      density="comfortable"
      :items="hasSite ? userStore.siteUsers : userStore.users"
      :loading="loading"
      :sort-by="[{ key: 'displayName', order: 'asc' }]"
      :headers="computedHeaders"
      item-value="id"
      :class="users.length === 0 && !loading ? 'no-data' : ''"
      :row-props="rowProps"
      :show-expand="!hasSite"
      class="h-100"
    >
      <template #item.displayName="{ item }">
        <ContentListItem>
          <template #prepend>
            <Avatar :name="item.displayName ?? item.email" :email="item.email" :size="34" />
          </template>
          <template #text>
            <div class="d-flex flex-column flex-sm-row align-sm-center">
              <span>{{ item.displayName ?? item.email }}</span>
              <div class="d-flex flex-wrap ga-1 mt-1 mt-sm-0 ms-sm-2">
                <VChip
                  v-if="isCurrentUser(item)"
                  text="You"
                  color="primary"
                  size="x-small"
                  variant="tonal"
                />
                <VChip
                  v-if="isNonActiveUser(item)"
                  :text="userStatusToString(item.status)"
                  :color="getUserStatusChipColor(item.status)"
                  size="x-small"
                  :prepend-icon="getUserStatusChipIcon(item.status)"
                />
              </div>
            </div>
          </template>
          <template #subtitle v-if="!!item.displayName">{{ item.email }}</template>
          <template #append>
            <div class="d-flex flex-row ga-1">
              <div class="info-icons">
                <div class="info-icon">
                  <UserItemMenu
                    :item="item"
                    :site-id="props.siteId"
                    :role="item.sites?.[0]?.role"
                  />
                </div>
              </div>
            </div>
          </template>
        </ContentListItem>
      </template>
      <template #item.sites[0].role="{ item }">
        <div class="role-selector-container">
          <div class="role-selector-wrapper">
            <CompactInlineSelector
              v-if="isEditableRole(getUserSiteRole(item))"
              class="user-role-selector"
              :icon="getRoleDescription(getUserSiteRole(item))?.icon"
              :label="getRoleDescription(getUserSiteRole(item))?.title ?? getUserSiteRole(item)"
              size="small"
              :menu-open="activeRoleMenuUserId === item.id"
              cursor="pointer"
            >
              <VSelect
                v-model="item.sites[0].role"
                :items="roleOptions"
                density="compact"
                variant="plain"
                hide-details
                class="compact-inline-selector__select user-role-selector-dropdown"
                menu-icon="fasl fa-chevron-down"
                :menu-props="{ contentClass: 'compact-inline-selector-menu' }"
                @update:model-value="updateSiteUser(item.id, $event, item.sites[0].expiresAt)"
                @update:menu="activeRoleMenuUserId = $event ? item.id : null"
              >
                <template #item="{ props: slotProps, item: slotItem }">
                  <div class="data-table-item" v-bind="slotProps">
                    <ContentListItem
                      :text="slotItem.raw.title"
                      :subtitle="slotItem.raw.subtitle"
                      :prepend-icon="slotItem.raw.icon"
                    />
                  </div>
                </template>
              </VSelect>
            </CompactInlineSelector>
            <CompactInlineSelector
              v-else
              v-tippy="{ content: getReadOnlyRoleTooltip(getUserSiteRole(item)), placement: 'top' }"
              class="user-role-selector user-role-selector--readonly"
              :icon="getRoleDescription(getUserSiteRole(item))?.icon"
              :label="getRoleDescription(getUserSiteRole(item))?.title ?? getUserSiteRole(item)"
              size="small"
              :show-chevron="false"
            />
          </div>
        </div>
      </template>
      <template #expanded-row="{ columns, item }">
        <tr class="data-table-item expanded-row">
          <td :colspan="columns.length" class="pb-4">
            <div class="d-flex flex-wrap ga-2 mx-2">
              <SiteSelectTags
                class="mb-1"
                :items="(item.sites ?? []).map((site: any) => ({ id: site.siteId, title: site.name, role: site.role, expiresAt: site.expiresAt }))"
                show-all
              />
            </div>
          </td>
        </tr>
      </template>
      <template #item.status="{ item }">
        <div class="d-flex flex-row mx-2 ga-2">
          <Tag :text="userStatusToString(item.status)" :color="item.status === 'active' ? 'success' : undefined" size="small" />
        </div>
      </template>
      <template #item.lastActive="{ item }">
        <div class="d-flex flex-row mx-2 ga-2 text-secondary">
          {{ getLastActive(item) }}
        </div>
      </template>
      <template #loading>
        <ContentListLoadingState :rows="10" variant="user" :show-checkbox="false" />
      </template>
      <template #bottom />
      <template #no-data>
        <VEmptyState title="No users" justify="center" class="flex-grow-1">
          <template #media>
            <VIcon icon="fasds fa-users" color="info" />
          </template>
          <template #text>
            <p v-if="hasSite" class="text-medium-emphasis">Add users to collaborate in this site.</p>
            <p v-else class="text-medium-emphasis">Add users to collaborate across your sites.</p>
          </template>
          <template #actions>
            <NewUser
              :site-id="props.siteId"
              :show-sites="!hasSite"
              :show-as-menu="false"
              text="Add user"
              variant="flat"
              rounded
              size="large"
              color="info"
              density="default"
            />
          </template>
        </VEmptyState>
      </template>
    </VDataTable>
  </div>
  <TableFooter
    v-model:page="page"
    v-model:items-per-page="profileStore.userPageSize"
    :items="items"
    item-label="Users"
  />
</template>

<style scoped>
.data-table-wrapper :deep(.v-data-table-progress) {
  display: none;
}

.data-table-wrapper :deep(.data-table-item--expandable) {
  cursor: pointer;
}

.data-table-wrapper :deep(.v-data-table-rows-loading),
.data-table-wrapper :deep(.v-data-table-rows-loading td),
.data-table-wrapper :deep(.v-data-table-rows-loading .v-data-table__td) {
  vertical-align: top !important;
}

.data-table-wrapper :deep(.v-data-table-rows-loading > td),
.data-table-wrapper :deep(.v-data-table-rows-loading .v-data-table__td) {
  padding: 0 !important;
}

.data-table-wrapper :deep(.v-data-table-rows-loading .content-list-loading-state) {
  margin: 0 !important;
}

.role-selector-container {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  margin: 0;
}

.role-selector-wrapper {
  width: 130px;
  display: flex;
  align-items: center;
  min-height: 44px;
}

.user-role-selector {
  min-height: 20px;
}

.user-role-selector--readonly {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.user-role-selector-dropdown {
  min-width: 130px;
}
</style>
