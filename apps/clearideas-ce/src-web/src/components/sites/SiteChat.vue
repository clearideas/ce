<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ceApi } from '../../api/client'
import { ICONS } from '../../icons'
import type { ChatConversationSummary } from '../../types/domain'
import BaseButton from '../base/BaseButton.vue'
import ChatPanel from '../chat/ChatPanel.vue'

/**
 * A site's AI tab: conversations about this site only (the same assistant as Ask). Conversations are
 * saved to the user's account; the latest one opens by default, earlier ones are in the picker, and
 * all of them are also listed under Ask.
 */
const props = defineProps<{ siteId: string }>()
const conversations = ref<ChatConversationSummary[]>([])
const conversationId = ref<string | null>(null)
const items = computed(() =>
  conversations.value.map(conversation => ({ title: conversation.title, value: conversation.id })),
)

onMounted(() => load(true))
watch(
  () => props.siteId,
  () => {
    conversationId.value = null
    void load(true)
  },
)

async function load(openLatest = false) {
  try {
    conversations.value = (await ceApi.chatConversations(props.siteId)).conversations
    if (openLatest) conversationId.value = conversations.value[0]?.id ?? null
  } catch {
    conversations.value = []
  }
}

function newChat() {
  conversationId.value = null
}
</script>

<template>
  <div class="site-chat">
    <div class="site-chat__header">
      <div class="site-chat__intro">
        <div class="site-chat__eyebrow">Site AI</div>
        <p class="site-chat__subtitle">
          Ask about this site. Conversations are saved to your account and listed under
          <RouterLink :to="{ name: 'ask' }">Ask</RouterLink>.
        </p>
      </div>
      <div class="site-chat__header-actions">
        <VSelect
          v-if="conversations.length > 0"
          v-model="conversationId"
          :items="items"
          label="Conversation"
          density="compact"
          variant="outlined"
          hide-details
          class="site-chat__conversations"
        />
        <BaseButton text="New chat" intent="tertiary" :prepend-icon="ICONS.add" @click="newChat" />
      </div>
    </div>

    <ChatPanel
      v-model:conversation-id="conversationId"
      :site-id="props.siteId"
      empty-title="Ask about this site"
      empty-text="Try asking for a summary, a file lookup, or details from a PDF that has extracted text."
      input-label="Ask this site"
      @answered="load()"
    />
  </div>
</template>

<style scoped>
.site-chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 16px;
  padding: 16px 24px 24px;
  overflow: hidden;
}

.site-chat__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  min-height: 88px;
  padding: 12px 16px 12px 18px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--ci-border-radius);
  background: rgb(var(--v-theme-surface));
}

.site-chat__intro {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.site-chat__eyebrow {
  color: rgb(var(--v-theme-primary));
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.site-chat__subtitle {
  margin: 2px 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.site-chat__subtitle a {
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
}

.site-chat__header-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
}

.site-chat__conversations {
  width: 280px;
}

@media (max-width: 700px) {
  .site-chat {
    padding: 12px;
  }

  .site-chat__header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    min-height: 0;
  }

  .site-chat__header-actions {
    justify-content: space-between;
  }

  .site-chat__conversations {
    flex: 1 1 auto;
    width: auto;
  }
}
</style>
