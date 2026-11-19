<script setup lang="ts">
import { DateTime } from 'luxon'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { ceApi } from '../api/client'
import BaseButton from '../components/base/BaseButton.vue'
import BaseDialog from '../components/base/BaseDialog.vue'
import EmptyState from '../components/base/EmptyState.vue'
import LoadError from '../components/base/LoadError.vue'
import PageHeader from '../components/base/PageHeader.vue'
import ChatPanel from '../components/chat/ChatPanel.vue'
import { ICONS } from '../icons'
import { useSiteStore } from '../stores'
import type { ChatConversationSummary, ChatScopeSite } from '../types/domain'
import { errorMessage } from '../utils/errors'

/**
 * Ask: one question box over every site the user can read that has AI chat turned on (or one chosen
 * site), answered by the agent runtime with the documents it used listed as sources. Conversations
 * are stored per user and listed here, including those started in a site's AI tab.
 */
const route = useRoute()
const router = useRouter()
const siteStore = useSiteStore()
const { mdAndUp } = useDisplay()

const configured = ref(true)
const sites = ref<ChatScopeSite[]>([])
const conversations = ref<ChatConversationSummary[]>([])
const loading = ref(true)
const loadFailure = ref('')
/** Scope of a new conversation: '' = all sites. */
const scope = ref('')
const renameOpen = ref(false)
const renameTitle = ref('')
const deleteOpen = ref(false)
const working = ref(false)

const conversationId = computed(() => {
  const raw = route.params.conversationId
  const id = Array.isArray(raw) ? raw[0] : raw
  return id ? String(id) : null
})
const current = computed(() => conversations.value.find(item => item.id === conversationId.value) ?? null)
const scopeItems = computed(() => [
  { title: `All sites (${sites.value.length})`, value: '' },
  ...sites.value.map(site => ({ title: site.name, value: site.id })),
])
const currentScope = computed(() =>
  current.value?.siteId ? `Site: ${siteName(current.value.siteId)}` : 'All sites with AI chat',
)

onMounted(load)

async function load() {
  loading.value = true
  loadFailure.value = ''
  try {
    const [models, scopeSites, list] = await Promise.all([
      ceApi.chatModels(),
      ceApi.chatSites(),
      ceApi.chatConversations(),
      siteStore.getSitesIfRequired().catch(() => undefined),
    ])
    configured.value = models.configured
    sites.value = scopeSites.sites
    conversations.value = list.conversations
  } catch (error) {
    loadFailure.value = errorMessage(error, 'Ask could not be loaded.')
  } finally {
    loading.value = false
  }
}

async function refreshConversations() {
  try {
    conversations.value = (await ceApi.chatConversations()).conversations
  } catch {
    // The list refreshes on the next turn or visit; the conversation itself is unaffected.
  }
}

function siteName(siteId: string) {
  return (
    sites.value.find(site => site.id === siteId)?.name ??
    siteStore.sites.find(site => site.id === siteId)?.name ??
    'Site'
  )
}

function openConversation(id: string | null) {
  void router.push(id ? { name: 'ask', params: { conversationId: id } } : { name: 'ask' })
}

function onCreated(id: string) {
  // Replace: the new-conversation URL should not stay in history as a separate, empty page.
  void router.replace({ name: 'ask', params: { conversationId: id } })
}

function updatedLabel(conversation: ChatConversationSummary) {
  const updated = DateTime.fromISO(conversation.updatedAt)
  if (Math.abs(updated.diffNow('seconds').seconds) < 60) return 'Just now'
  return updated.toRelative() ?? ''
}

function startRename() {
  renameTitle.value = current.value?.title ?? ''
  renameOpen.value = true
}

async function rename() {
  if (!current.value || !renameTitle.value.trim()) return
  working.value = true
  try {
    await ceApi.renameChatConversation(current.value.id, renameTitle.value.trim())
    renameOpen.value = false
    await refreshConversations()
  } finally {
    working.value = false
  }
}

async function remove() {
  if (!current.value) return
  working.value = true
  try {
    await ceApi.deleteChatConversation(current.value.id)
    deleteOpen.value = false
    await refreshConversations()
    openConversation(null)
  } finally {
    working.value = false
  }
}
</script>

<template>
  <div class="ask-view">
    <PageHeader title="Ask" />

    <div v-if="loading" class="ask-view__center">
      <VProgressCircular indeterminate aria-label="Loading Ask" />
    </div>
    <LoadError v-else-if="loadFailure" :message="loadFailure" @retry="load" />
    <EmptyState
      v-else-if="!configured"
      :icon="ICONS.ai"
      title="AI chat is not configured"
      text="An administrator can turn it on by setting AI_CHAT_MODEL (for example openai:gpt-5.6-luna) and the provider's API key, then restarting Clear Ideas."
    />
    <EmptyState
      v-else-if="sites.length === 0 && conversations.length === 0"
      :icon="ICONS.ai"
      title="None of your sites has AI chat turned on"
      text="A site admin can turn it on in the site's Settings → AI. Ask then answers from the documents in those sites."
    />

    <div v-else class="ask-view__layout">
      <nav v-if="mdAndUp" class="ask-view__history" aria-label="Conversations">
        <BaseButton
          text="New chat"
          intent="secondary"
          :prepend-icon="ICONS.add"
          block
          class="ask-view__new"
          @click="openConversation(null)"
        />
        <ul v-if="conversations.length > 0" class="ask-view__list">
          <li v-for="conversation in conversations" :key="conversation.id">
            <RouterLink
              class="ask-view__item"
              :class="{ 'ask-view__item--active': conversation.id === conversationId }"
              :to="{ name: 'ask', params: { conversationId: conversation.id } }"
              :aria-current="conversation.id === conversationId ? 'page' : undefined"
            >
              <span class="ask-view__item-title">{{ conversation.title }}</span>
              <span class="ask-view__item-meta">
                <template v-if="conversation.siteId">{{ siteName(conversation.siteId) }} · </template>
                {{ updatedLabel(conversation) }}
              </span>
            </RouterLink>
          </li>
        </ul>
        <p v-else class="ask-view__hint">Your conversations will be listed here.</p>
      </nav>

      <section class="ask-view__main" :aria-label="current?.title ?? 'New conversation'">
        <div class="ask-view__bar">
          <div class="ask-view__bar-title">
            <h2 class="ask-view__title">{{ current?.title ?? 'New conversation' }}</h2>
            <span v-if="current" class="ask-view__scope">{{ currentScope }}</span>
          </div>
          <div class="ask-view__bar-actions">
            <VSelect
              v-if="!conversationId"
              v-model="scope"
              :items="scopeItems"
              label="Search in"
              density="compact"
              variant="outlined"
              hide-details
              class="ask-view__scope-select"
            />
            <VMenu v-if="!mdAndUp && conversations.length > 0">
              <template #activator="{ props: menuProps }">
                <BaseButton
                  v-bind="menuProps"
                  text="History"
                  intent="tertiary"
                  :prepend-icon="ICONS.history"
                />
              </template>
              <VList density="compact" nav aria-label="Conversations">
                <VListItem
                  v-for="conversation in conversations"
                  :key="conversation.id"
                  :title="conversation.title"
                  :subtitle="updatedLabel(conversation)"
                  :active="conversation.id === conversationId"
                  @click="openConversation(conversation.id)"
                />
              </VList>
            </VMenu>
            <!-- Desktop has New chat above the history list. -->
            <BaseButton
              v-if="!mdAndUp && conversationId"
              text="New chat"
              intent="tertiary"
              :prepend-icon="ICONS.add"
              @click="openConversation(null)"
            />
            <VMenu v-if="current">
              <template #activator="{ props: menuProps }">
                <BaseButton
                  v-bind="menuProps"
                  :icon="ICONS.moreVertical"
                  intent="tertiary"
                  aria-label="Conversation actions"
                  aria-haspopup="menu"
                />
              </template>
              <VList density="compact" nav>
                <VListItem title="Rename" @click="startRename" />
                <VListItem title="Delete" @click="deleteOpen = true" />
              </VList>
            </VMenu>
          </div>
        </div>

        <ChatPanel
          :conversation-id="conversationId"
          :site-id="scope || undefined"
          show-source-sites
          @update:conversation-id="onCreated"
          @answered="refreshConversations"
        />
      </section>
    </div>

    <BaseDialog
      v-model="renameOpen"
      max-width="480"
      title="Rename conversation"
      form="rename-conversation-form"
      confirm-text="Rename"
      :confirm-disabled="!renameTitle.trim()"
      :loading="working"
    >
      <VForm id="rename-conversation-form" @submit.prevent="rename">
        <VCardText>
          <VTextField v-model="renameTitle" label="Title" maxlength="120" autofocus />
        </VCardText>
      </VForm>
    </BaseDialog>
    <BaseDialog
      v-model="deleteOpen"
      max-width="480"
      title="Delete conversation"
      confirm-text="Delete"
      confirm-intent="danger"
      :loading="working"
      @confirm="remove"
    >
      <VCardText>Delete “{{ current?.title }}”? This cannot be undone.</VCardText>
    </BaseDialog>
  </div>
</template>

<style scoped>
.ask-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 16px 8px 16px 0;
}

.ask-view__center {
  display: flex;
  justify-content: center;
  padding: 48px;
}

.ask-view__layout {
  display: flex;
  flex: 1;
  gap: 16px;
  min-height: 0;
}

.ask-view__history {
  display: flex;
  flex: 0 0 260px;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.ask-view__new {
  /* A block button grows along the column otherwise. */
  flex: 0 0 auto;
}

.ask-view__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.ask-view__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: var(--ci-border-radius);
  color: inherit;
}

.ask-view__item:hover {
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.ask-view__item--active {
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.ask-view__item-title {
  overflow: hidden;
  font-size: 0.875rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ask-view__item-meta,
.ask-view__hint,
.ask-view__scope {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
}

.ask-view__main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  padding: 12px 16px 16px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--ci-border-radius);
  background: rgb(var(--v-theme-surface));
}

.ask-view__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}

.ask-view__bar-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ask-view__title {
  overflow: hidden;
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ask-view__bar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ask-view__scope-select {
  width: 240px;
}

@media (max-width: 959px) {
  .ask-view {
    padding: 8px 0;
  }

  .ask-view__main {
    padding: 10px;
  }

  .ask-view__scope-select {
    flex: 1 1 200px;
    width: auto;
  }
}
</style>
