<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { setUnauthorizedHandler } from './api/fetchPrivate'
import AppLayout from './layouts/AppLayout.vue'
import { useAppTheme } from './composables/useAppTheme'
import { useAuthStore } from './stores'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { session, booted } = storeToRefs(authStore)
const isPublicRoute = computed(() => route.meta.public === true)
const { initializeTheme, watchSystemTheme } = useAppTheme()

setUnauthorizedHandler(async () => {
  session.value = null
  if (!isPublicRoute.value && route.path !== '/login') await router.push('/login')
})

async function requireSession() {
  if (!booted.value) await authStore.getSession()
  if (!session.value && !isPublicRoute.value) await router.push('/login')
}

onMounted(() => {
  initializeTheme()
  watchSystemTheme()
  void requireSession()
})
watch(() => route.fullPath, requireSession)
</script>

<template>
  <VApp style="height: 100vh; overflow-y: hidden">
    <VMain v-if="!booted" class="boot-screen">
      <VProgressCircular indeterminate color="primary" />
      <p>Loading Clear Ideas CE...</p>
    </VMain>
    <RouterView v-else-if="isPublicRoute" />
    <RouterView v-else-if="!session" />
    <AppLayout v-else :session="session" />
  </VApp>
</template>
