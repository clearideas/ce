import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ceApi } from '../api/client'
import type { User, UserGroup } from '../types/domain'
import { useAlert } from '../composables/useAlert'

export const useUserStore = defineStore('user', () => {
  const users = ref<User[]>([])
  const siteUsers = ref<User[]>([])
  const userGroups = ref<UserGroup[]>([])
  const loading = ref(false)
  const loadingUsers = ref(false)
  const loadingSiteUsers = ref(false)
  const loadingUserGroups = ref(false)
  const usersLastUpdated = ref(0)
  const siteUsersLastUpdated = ref(0)
  const alert = useAlert()

  async function getUsers() {
    loading.value = true
    loadingUsers.value = true
    try {
      users.value = (await ceApi.users()).users
      usersLastUpdated.value = Date.now()
      return users.value
    } finally {
      loadingUsers.value = false
      loading.value = false
    }
  }

  async function getSiteUsers(siteId: string) {
    loadingSiteUsers.value = true
    try {
      siteUsers.value = (await ceApi.siteUsers(siteId)).users
      siteUsersLastUpdated.value = Date.now()
      return siteUsers.value
    } finally {
      loadingSiteUsers.value = false
    }
  }

  async function getUserGroups() {
    loadingUserGroups.value = true
    try {
      userGroups.value = (await ceApi.userGroups()).userGroups
      return userGroups.value
    } finally {
      loadingUserGroups.value = false
    }
  }

  async function createUserGroup(input: { name: string; users?: string[] }) {
    try {
      const response = await ceApi.createUserGroup(input)
      await getUserGroups()
      alert.add({ message: `User group "${input.name}" created.`, type: 'success', timeout: 3000 })
      return response.userGroup
    } catch (error) {
      alert.add({ message: error instanceof Error ? error.message : 'User group could not be created.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  async function createUser(input: { email: string; displayName?: string; siteIds?: string[]; siteRole?: string }) {
    try {
      const siteIds = input.siteIds ?? []
      if (siteIds.length === 0) throw new Error('At least one site is required.')
      const responses = []
      for (const siteId of siteIds) {
        responses.push(await ceApi.addSiteUser(siteId, {
          email: input.email,
          displayName: input.displayName,
          siteRole: input.siteRole,
        }))
      }
      const response = responses[0]
      await getUsers()
      for (const siteId of siteIds) await getSiteUsers(siteId)
      alert.add({ message: `User added: "${response.user.email}".`, type: 'success', timeout: 3000 })
      return response.user
    } catch (error) {
      alert.add({ message: error instanceof Error ? error.message : 'User could not be added.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  async function addUsersToGroup(groupId: string, usersToAdd: string[]) {
    try {
      const response = await ceApi.addUsersToGroup(groupId, usersToAdd)
      const index = userGroups.value.findIndex(group => group.id === response.userGroup.id)
      if (index >= 0) userGroups.value[index] = response.userGroup
      else userGroups.value.push(response.userGroup)
      alert.add({ message: 'Users added to group.', type: 'success', timeout: 3000 })
      return response.userGroup
    } catch (error) {
      alert.add({ message: error instanceof Error ? error.message : 'Users could not be added to group.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  async function deleteSiteUser(siteId: string, userId: string) {
    try {
      await ceApi.deleteSiteUser(siteId, userId)
      await getSiteUsers(siteId)
      await getUsers()
      alert.add({ message: 'User removed from site.', type: 'success', timeout: 3000 })
    } catch (error) {
      alert.add({ message: error instanceof Error ? error.message : 'User could not be removed from site.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  async function updateSiteUser(siteId: string, userId: string, role: string, expiresAt: Date | null) {
    try {
      await ceApi.updateSiteUser(siteId, userId, { role, ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}) })
      await getSiteUsers(siteId)
      await getUsers()
      alert.add({ message: 'User role updated.', type: 'success', timeout: 3000 })
    } catch (error) {
      alert.add({ message: error instanceof Error ? error.message : 'User role could not be updated.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  async function deleteUser(userId: string) {
    try {
      await ceApi.deleteUser(userId)
      await getUsers()
      alert.add({ message: 'User removed from all sites.', type: 'success', timeout: 3000 })
    } catch (error) {
      alert.add({ message: error instanceof Error ? error.message : 'User could not be removed from all sites.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  async function resendInvite(siteId: string, userId: string) {
    try {
      await ceApi.resendInvite(siteId, userId)
      alert.add({ message: 'Invite resend request completed.', type: 'success', timeout: 3000 })
    } catch (error) {
      alert.add({ message: error instanceof Error ? error.message : 'Invite could not be resent.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  async function removeUsersFromGroup(groupId: string, userId: string) {
    try {
      const response = await ceApi.removeUserFromGroup(groupId, userId)
      const index = userGroups.value.findIndex(group => group.id === response.userGroup.id)
      if (index >= 0) userGroups.value[index] = response.userGroup
      alert.add({ message: 'User removed from group.', type: 'success', timeout: 3000 })
      return response.userGroup
    } catch (error) {
      alert.add({ message: error instanceof Error ? error.message : 'User could not be removed from group.', type: 'error', timeout: 5000 })
      throw error
    }
  }

  return {
    users,
    siteUsers,
    userGroups,
    loading,
    loadingUsers,
    loadingSiteUsers,
    loadingUserGroups,
    usersLastUpdated,
    siteUsersLastUpdated,
    getUsers,
    getSiteUsers,
    getUserGroups,
    createUser,
    createUserGroup,
    addUsersToGroup,
    updateSiteUser,
    deleteSiteUser,
    deleteUser,
    resendInvite,
    removeUsersFromGroup,
  }
})
