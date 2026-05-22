<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '../../base/BaseButton.vue'
import IconCheckbox from '../../base/IconCheckbox.vue'
import SettingsCard from '../../base/SettingsCard.vue'
import NewAccessKey from '../../settings/NewAccessKey.vue'
import { useSiteStore } from '../../../stores'

const siteStore = useSiteStore()
const isInitialized = ref(false)
const ai = ref({
  chatEnabled: false,
  mcpEnabled: false,
})

function initializeComponentState() {
  const current = siteStore.currentSite?.attributes?.ai ?? {}
  ai.value = {
    chatEnabled: current.chatEnabled === true,
    mcpEnabled: current.mcpEnabled === true || siteStore.currentSite?.attributes?.mcp?.enabled === true,
  }
  isInitialized.value = true
}

async function handleUpdate() {
  await siteStore.updateCurrentSite({
    attributes: {
      ai: {
        ...(siteStore.currentSite?.attributes?.ai ?? {}),
        chatEnabled: ai.value.chatEnabled,
        mcpEnabled: ai.value.mcpEnabled,
      },
    },
  })
}

watch(() => siteStore.currentSite, initializeComponentState, { immediate: true })
</script>

<template>
  <SettingsCard
    title="AI"
    subtitle="Enable site-scoped AI chat and MCP access for this site."
    :is-initialized="isInitialized"
    icon="fasl fa-robot"
  >
    <template #content>
      <div class="d-flex flex-column ga-2 mb-4">
        <IconCheckbox
          v-model="ai.chatEnabled"
          label="Enable AI chat"
          description="Show the AI tab and allow users with site access to ask questions about this site's content."
        />
        <IconCheckbox
          v-model="ai.mcpEnabled"
          label="Enable MCP access"
          description="Allow MCP clients to access this site's CE content through access keys."
        />
        <div class="text-body-2 text-medium-emphasis">
          MCP endpoint: <code>/api/mcp</code>
        </div>
      </div>
    </template>
    <template #footer>
      <BaseButton text="Save AI" color="primary" variant="flat" @click="handleUpdate" />
      <NewAccessKey text="Create access key" size="default" />
    </template>
  </SettingsCard>
</template>
