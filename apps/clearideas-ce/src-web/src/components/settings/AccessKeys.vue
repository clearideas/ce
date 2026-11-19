<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import BaseButton from '../base/BaseButton.vue'
import BaseDialog from '../base/BaseDialog.vue'
import EmptyState from '../base/EmptyState.vue'
import SettingsCard from '../base/SettingsCard.vue'
import NewAccessKey from './NewAccessKey.vue'
import { ICONS } from '../../icons'
import { useAccessKeyStore } from '../../stores'

/** API / MCP access keys: create, see the new secret once, revoke (with confirmation). */
const accessKeyStore = useAccessKeyStore()
const { accessKeys, newKey, loading, error } = storeToRefs(accessKeyStore)
const keyToRevoke = ref<{ id: string; name: string } | null>(null)
const revoking = ref(false)
const copied = ref(false)

function formatDate(value?: string | null) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

function isExpired(value?: string | null) {
  return Boolean(value && new Date(value) < new Date())
}

async function copyNewKey() {
  if (!newKey.value || !navigator.clipboard) return
  await navigator.clipboard.writeText(newKey.value)
  copied.value = true
  window.setTimeout(() => (copied.value = false), 2000)
}

async function revoke() {
  if (!keyToRevoke.value) return
  revoking.value = true
  try {
    await accessKeyStore.revokeAccessKey(keyToRevoke.value.id) // the store reports success/failure
    keyToRevoke.value = null
  } finally {
    revoking.value = false
  }
}
</script>

<template>
  <SettingsCard
    title="Access keys"
    subtitle="Create and revoke keys for API and MCP integrations."
    :icon="ICONS.key"
    :is-initialized="!loading"
  >
    <div class="d-flex flex-wrap ga-2 align-center mb-6">
      <NewAccessKey />
    </div>

    <div v-if="newKey" class="settings-management-section mb-6">
      <div class="settings-management-item access-keys__new-key" role="status">
        <VIcon :icon="ICONS.key" size="24" color="success" class="settings-status-item-icon" />
        <div class="content">
          <div class="title d-flex align-center ga-2">
            Save this key now
            <VChip size="x-small" color="success">MCP</VChip>
          </div>
          <div class="subtitle">
            <div class="text-caption text-medium-emphasis mb-2">This secret will not be shown again.</div>
            <code class="access-keys__secret">{{ newKey }}</code>
          </div>
        </div>
        <div class="d-flex ga-2">
          <BaseButton
            :text="copied ? 'Copied' : 'Copy'"
            intent="secondary"
            size="small"
            :prepend-icon="copied ? ICONS.check : ICONS.copy"
            @click="copyNewKey"
          />
          <BaseButton text="Done" intent="tertiary" size="small" @click="accessKeyStore.clearNewKey()" />
        </div>
      </div>
    </div>

    <div v-if="loading" class="text-center py-8">
      <VProgressCircular indeterminate aria-label="Loading access keys" />
    </div>
    <EmptyState
      v-else-if="accessKeys.length === 0"
      :icon="ICONS.key"
      title="No access keys"
      text="Create an access key to connect API and MCP integrations."
      compact
    >
      <template #actions><NewAccessKey /></template>
    </EmptyState>
    <ul v-else class="settings-management-section access-keys__list">
      <li
        v-for="key in accessKeys"
        :key="key.id"
        class="settings-management-item"
        :class="{ 'opacity-60': key.isActive === false }"
      >
        <VIcon
          icon="fas fa-microchip"
          size="24"
          :color="key.isActive === false ? undefined : 'primary'"
          class="settings-status-item-icon"
        />
        <div class="content">
          <div class="title d-flex align-center flex-wrap ga-2">
            {{ key.name }}
            <VChip size="x-small" :color="key.isActive === false ? undefined : 'primary'">{{
              key.keyType.toUpperCase()
            }}</VChip>
            <VChip v-if="key.isActive === false" size="x-small" color="error" :prepend-icon="ICONS.block"
              >Revoked</VChip
            >
            <VChip
              v-else-if="isExpired(key.expiresAt)"
              size="x-small"
              color="warning"
              variant="flat"
              prepend-icon="fas fa-clock"
              >Expired</VChip
            >
          </div>
          <div class="subtitle">
            <div class="text-caption text-medium-emphasis d-flex flex-wrap ga-2">
              <span>Created {{ formatDate(key.createdAt) }}</span>
              <span aria-hidden="true">•</span>
              <span>Last used {{ formatDate(key.lastUsedAt) }}</span>
              <template v-if="key.expiresAt">
                <span aria-hidden="true">•</span>
                <span>Expires {{ formatDate(key.expiresAt) }}</span>
              </template>
            </div>
            <div class="text-caption text-medium-emphasis mt-1">Scopes: {{ key.scopes.join(', ') }}</div>
          </div>
        </div>
        <div class="d-flex ga-2">
          <BaseButton
            v-if="key.isActive !== false"
            text="Revoke"
            intent="danger"
            variant="outlined"
            size="small"
            :aria-label="`Revoke access key ${key.name}`"
            @click="keyToRevoke = { id: key.id, name: key.name }"
          />
        </div>
      </li>
    </ul>

    <VAlert
      v-if="error"
      type="error"
      variant="tonal"
      class="mt-4"
      closable
      @click:close="accessKeyStore.clearError()"
    >
      {{ error }}
    </VAlert>

    <BaseDialog
      :model-value="keyToRevoke !== null"
      max-width="480"
      title="Revoke access key"
      confirm-text="Revoke"
      confirm-intent="danger"
      :loading="revoking"
      @update:model-value="value => !value && (keyToRevoke = null)"
      @confirm="revoke"
    >
      <VCardText>
        Revoke “{{ keyToRevoke?.name }}”? Integrations using this key will stop working immediately. This
        cannot be undone.
      </VCardText>
    </BaseDialog>
  </SettingsCard>
</template>

<style scoped>
.access-keys__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.access-keys__new-key {
  border-color: rgb(var(--v-theme-success));
  border-width: 2px;
}

.access-keys__secret {
  display: block;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  font-family: var(--ci-font-family-mono);
  font-size: 0.8rem;
  overflow-wrap: anywhere;
  user-select: all;
}
</style>
