<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseButton from '../base/BaseButton.vue'
import BaseDialog from '../base/BaseDialog.vue'
import SettingsCard from '../base/SettingsCard.vue'
import { ceApi } from '../../api/client'
import { useAlert } from '../../composables/useAlert'
import { ICONS } from '../../icons'
import { useAuthStore } from '../../stores'
import type { AuthSession } from '../../types/domain'
import { errorMessage } from '../../utils/errors'
import { formatRelativeDate } from '../../utils/format'
import { describeUserAgent, type DeviceKind } from '../../utils/userAgent'

/**
 * Settings → Active sessions (plan 3.8). Lists the user's Better Auth sessions through the CE API
 * (`/api/auth/list-sessions`), marks the one this browser uses, and lets the user sign out any
 * other session or all of them at once. Signing out *this* browser is the regular logout.
 */
const authStore = useAuthStore()
const router = useRouter()
const alert = useAlert()
const { session } = storeToRefs(authStore)

const sessions = ref<AuthSession[]>([])
const currentSessionId = ref<string | null>(null)
const loading = ref(true)
const loadError = ref('')
const signingOut = ref(false)
const sessionToRevoke = ref<AuthSession | null>(null)
const confirmRevokeOthers = ref(false)
const revoking = ref(false)

const DEVICE_ICONS: Record<DeviceKind, string> = {
  desktop: 'fas fa-desktop',
  mobile: 'fas fa-mobile-screen',
  tablet: 'fas fa-tablet-screen-button',
}

type SessionRow = AuthSession & { device: ReturnType<typeof describeUserAgent>; icon: string }

function toRow(item: AuthSession): SessionRow {
  const device = describeUserAgent(item.userAgent)
  return { ...item, device, icon: DEVICE_ICONS[device.kind] }
}

const currentSession = computed(() => {
  const match = sessions.value.find(item => item.id === currentSessionId.value)
  return match ? toRow(match) : null
})

const otherSessions = computed(() =>
  sessions.value
    .filter(item => item.id !== currentSessionId.value)
    .map(toRow)
    .sort((a, b) => lastActive(b).localeCompare(lastActive(a))),
)

function lastActive(item: AuthSession) {
  return item.updatedAt ?? item.createdAt
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [list, current] = await Promise.all([ceApi.listSessions(), ceApi.currentSession()])
    sessions.value = Array.isArray(list) ? list : []
    currentSessionId.value = current?.session?.id ?? null
  } catch (error) {
    loadError.value = errorMessage(error, 'Your sessions could not be loaded.')
  } finally {
    loading.value = false
  }
}

async function signOut() {
  signingOut.value = true
  try {
    await authStore.logout()
    await router.push('/login')
  } finally {
    signingOut.value = false
  }
}

async function revoke() {
  const target = sessionToRevoke.value
  if (!target) return
  revoking.value = true
  try {
    await ceApi.revokeSession(target.token)
    sessions.value = sessions.value.filter(item => item.id !== target.id)
    sessionToRevoke.value = null
    alert.add({ message: 'Session signed out.', type: 'success', timeout: 3000 })
  } catch (error) {
    alert.add({
      message: errorMessage(error, 'The session could not be signed out.'),
      type: 'error',
      timeout: 5000,
    })
  } finally {
    revoking.value = false
  }
}

async function revokeOthers() {
  revoking.value = true
  try {
    await ceApi.revokeOtherSessions()
    confirmRevokeOthers.value = false
    alert.add({ message: 'Signed out of all other sessions.', type: 'success', timeout: 3000 })
    await load()
  } catch (error) {
    alert.add({
      message: errorMessage(error, 'Other sessions could not be signed out.'),
      type: 'error',
      timeout: 5000,
    })
  } finally {
    revoking.value = false
  }
}

onMounted(load)
</script>

<template>
  <SettingsCard title="Active sessions" subtitle="Where you are signed in." icon="fas fa-shield-halved">
    <div class="settings-management-section">
      <div class="settings-management-item active-sessions__current" data-testid="current-session">
        <VIcon
          :icon="currentSession?.icon ?? ICONS.public"
          size="24"
          color="primary"
          class="settings-status-item-icon"
        />
        <div class="content">
          <div class="title d-flex align-center flex-wrap ga-2">
            This browser
            <VChip size="x-small" color="success" :prepend-icon="ICONS.check">Current</VChip>
          </div>
          <div class="subtitle text-caption text-medium-emphasis d-flex flex-wrap ga-2">
            <span>Signed in as {{ session?.user.email }}</span>
            <template v-if="currentSession">
              <span aria-hidden="true">•</span>
              <span>{{ currentSession.device.label }}</span>
              <template v-if="currentSession.ipAddress">
                <span aria-hidden="true">•</span>
                <span>{{ currentSession.ipAddress }}</span>
              </template>
            </template>
          </div>
        </div>
        <div class="d-flex align-center">
          <BaseButton
            text="Sign out"
            intent="secondary"
            size="small"
            :loading="signingOut"
            @click="signOut"
          />
        </div>
      </div>
    </div>

    <h3 class="mt-6 mb-2">Other sessions</h3>
    <div v-if="loading" class="text-center py-6">
      <VProgressCircular indeterminate aria-label="Loading sessions" />
    </div>
    <VAlert v-else-if="loadError" type="error" variant="tonal" class="mt-2">
      {{ loadError }}
      <template #append>
        <BaseButton text="Retry" intent="tertiary" size="small" @click="load" />
      </template>
    </VAlert>
    <p v-else-if="otherSessions.length === 0" class="text-body-2 text-medium-emphasis">
      You are not signed in anywhere else.
    </p>
    <template v-else>
      <ul class="settings-management-section active-sessions__list" aria-label="Other sessions">
        <li v-for="item in otherSessions" :key="item.id" class="settings-management-item">
          <VIcon :icon="item.icon" size="24" class="settings-status-item-icon" />
          <div class="content">
            <div class="title">{{ item.device.label }}</div>
            <div class="subtitle text-caption text-medium-emphasis d-flex flex-wrap ga-2">
              <template v-if="item.ipAddress">
                <span>{{ item.ipAddress }}</span>
                <span aria-hidden="true">•</span>
              </template>
              <span>Last active {{ formatRelativeDate(lastActive(item)) }}</span>
              <span aria-hidden="true">•</span>
              <span>Signed in {{ formatDate(item.createdAt) }}</span>
              <span aria-hidden="true">•</span>
              <span>Expires {{ formatDate(item.expiresAt) }}</span>
            </div>
          </div>
          <div class="d-flex align-center">
            <BaseButton
              text="Sign out"
              intent="danger"
              variant="outlined"
              size="small"
              :aria-label="`Sign out session on ${item.device.label}`"
              @click="sessionToRevoke = item"
            />
          </div>
        </li>
      </ul>
      <div class="mt-4">
        <BaseButton
          text="Sign out everywhere else"
          intent="danger"
          variant="outlined"
          :prepend-icon="ICONS.logout"
          @click="confirmRevokeOthers = true"
        />
      </div>
    </template>

    <BaseDialog
      :model-value="sessionToRevoke !== null"
      max-width="480"
      title="Sign out session"
      confirm-text="Sign out"
      confirm-intent="danger"
      :loading="revoking"
      @update:model-value="value => !value && (sessionToRevoke = null)"
      @confirm="revoke"
    >
      <VCardText>
        Sign out the session on
        {{ sessionToRevoke ? describeUserAgent(sessionToRevoke.userAgent).label : '' }}? That browser will
        need a new sign-in code to get back in.
      </VCardText>
    </BaseDialog>

    <BaseDialog
      v-model="confirmRevokeOthers"
      max-width="480"
      title="Sign out everywhere else"
      confirm-text="Sign out all"
      confirm-intent="danger"
      :loading="revoking"
      @confirm="revokeOthers"
    >
      <VCardText>
        Sign out all {{ otherSessions.length }} other
        {{ otherSessions.length === 1 ? 'session' : 'sessions' }}? This browser stays signed in.
      </VCardText>
    </BaseDialog>
  </SettingsCard>
</template>

<style scoped>
.active-sessions__current {
  border-color: rgb(var(--v-theme-primary));
  border-width: 2px;
}

.active-sessions__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
</style>
