import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ceApi } from '../api/client'
import { useAlert } from '../composables/useAlert'
import type { AccessKey } from '../types/domain'

export const useAccessKeyStore = defineStore('accessKey', () => {
  const accessKeys = ref<AccessKey[]>([])
  const newKey = ref('')
  const loading = ref(false)
  const creatingKey = ref(false)
  const error = ref('')
  const alert = useAlert()
  const keyTypes = ref<Record<string, string[]>>({
    mcp: ['mcp:read', 'mcp:write'],
    webhook: ['receive_events'],
  })

  async function getAccessKeys() {
    loading.value = true
    try {
      accessKeys.value = (await ceApi.accessKeys()).accessKeys
      return accessKeys.value
    } finally {
      loading.value = false
    }
  }

  async function fetchKeyTypes() {
    try {
      const response = await ceApi.accessKeyTypes()
      keyTypes.value = response.keyTypes
    } catch {
      // Keep the CE defaults available so the creation dialog never degrades into a warning panel.
    }
    return keyTypes.value
  }

  async function createAccessKey(input?: { name?: string; description?: string; keyType?: string; scopes?: string[]; expiresIn?: number }) {
    error.value = ''
    creatingKey.value = true
    try {
      const response = await ceApi.createAccessKey(input)
      newKey.value = response.key
      await getAccessKeys()
      alert.add({ message: 'Access key created. Store the secret now; it will not be shown again.', type: 'success', timeout: 5000 })
      return response
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Could not create access key'
      alert.add({ message: error.value, type: 'error', timeout: 5000 })
      throw err
    } finally {
      creatingKey.value = false
    }
  }

  async function revokeAccessKey(keyId: string) {
    error.value = ''
    try {
      await ceApi.revokeAccessKey(keyId)
      await getAccessKeys()
      alert.add({ message: 'Access key revoked.', type: 'success', timeout: 3000 })
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Could not revoke access key'
      alert.add({ message: error.value, type: 'error', timeout: 5000 })
      throw err
    }
  }

  function clearNewKey() {
    newKey.value = ''
  }

  function clearError() {
    error.value = ''
  }

  return { accessKeys, newKey, loading, creatingKey, error, keyTypes, getAccessKeys, fetchKeyTypes, createAccessKey, revokeAccessKey, clearNewKey, clearError }
})
