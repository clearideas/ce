import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authApi } from '../api/client'
import type { Session } from '../types/domain'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const loading = ref(false)
  const booted = ref(false)
  const isAuthenticated = computed(() => session.value != null)

  async function getSession() {
    loading.value = true
    try {
      session.value = await authApi.session()
    } catch {
      session.value = null
    } finally {
      loading.value = false
      booted.value = true
    }
    return session.value
  }

  async function sendCode(input: { email: string }) {
    loading.value = true
    try {
      return await authApi.sendCode(input)
    } finally {
      loading.value = false
      booted.value = true
    }
  }

  async function verifyCode(input: { email: string; code: string; name?: string }) {
    loading.value = true
    try {
      session.value = await authApi.verifyCode(input)
      return session.value
    } finally {
      loading.value = false
      booted.value = true
    }
  }

  async function logout() {
    await authApi.logout()
    session.value = null
  }

  return { session, loading, booted, isAuthenticated, getSession, sendCode, verifyCode, logout }
})
