<script setup lang="ts">
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { ceApi } from '../../api/client'
import { ICONS } from '../../icons'
import type { ChatSource } from '../../types/domain'
import {
  chatTurnBody,
  messageSources,
  messageText,
  toUIMessages,
  visibleMessages,
  type ChatUIMessage,
  type ConversationInfo,
} from '../../utils/chat'
import { errorMessage } from '../../utils/errors'
import { fileIcon } from '../../utils/format'
import BaseButton from '../base/BaseButton.vue'
import EmptyState from '../base/EmptyState.vue'
import MarkdownRenderer from '../base/MarkdownRenderer.vue'

/**
 * A conversation with the Clear Ideas assistant (agent runtime on the server), used by Ask and by a
 * site's AI tab.
 *
 * - `conversationId`: the stored conversation to show; `null` for a new one. When the first answer
 *   creates the conversation the panel emits `update:conversationId` (the parent may route to it).
 * - `siteId`: scope of a new conversation (Site AI); without it, every site with AI chat on.
 * - Answers stream in; the files an answer is based on are listed under it and link to the file.
 */
const props = withDefaults(
  defineProps<{
    conversationId: string | null
    siteId?: string
    /** Empty-state copy for a new conversation. */
    emptyTitle?: string
    emptyText?: string
    /** Label of the question box. */
    inputLabel?: string
    /** Show which site each source is in (conversations across several sites). */
    showSourceSites?: boolean
  }>(),
  {
    siteId: undefined,
    emptyTitle: 'Ask about your documents',
    emptyText: 'Ask for a summary, a figure, or where something is written. Answers list the files they use.',
    inputLabel: 'Ask a question',
    showSourceSites: false,
  },
)
const emit = defineEmits<{
  'update:conversationId': [id: string]
  /** A turn finished (the conversation list may have changed: new conversation, new activity). */
  answered: [conversation: ConversationInfo]
}>()

const input = ref('')
const models = ref<string[]>([])
const selectedModel = ref('')
const status = ref('')
const loadError = ref('')
const loadingConversation = ref(false)
/** The conversation the chat is talking in (set by the server for a new one). */
const currentId = ref<string | null>(props.conversationId)
let lastConversation: ConversationInfo | null = null
const chat = shallowRef(createChat([]))

const busy = computed(() => chat.value.status === 'submitted' || chat.value.status === 'streaming')
const shown = computed(() => visibleMessages(chat.value.messages, busy.value))
const chatError = computed(() => (chat.value.error ? friendlyError(chat.value.error) : ''))
const modelItems = computed(() => models.value.map(model => ({ title: modelLabel(model), value: model })))

onMounted(async () => {
  void loadModels()
  await openConversation(props.conversationId)
})

watch(
  () => props.conversationId,
  id => {
    // The id the panel itself just received from the server: keep the live chat.
    if (id === currentId.value) return
    void openConversation(id)
  },
)

async function loadModels() {
  try {
    const response = await ceApi.chatModels()
    models.value = response.models
    selectedModel.value = response.models.includes(response.defaultModel)
      ? response.defaultModel
      : (response.models[0] ?? '')
  } catch {
    models.value = []
  }
}

async function openConversation(id: string | null) {
  chat.value.stop()
  currentId.value = id
  loadError.value = ''
  status.value = ''
  if (!id) {
    chat.value = createChat([])
    return
  }
  loadingConversation.value = true
  try {
    const { conversation } = await ceApi.chatConversation(id)
    if (currentId.value === id) chat.value = createChat(toUIMessages(conversation.messages))
  } catch (error) {
    loadError.value = errorMessage(error, 'This conversation could not be loaded.')
    chat.value = createChat([])
  } finally {
    loadingConversation.value = false
  }
}

function createChat(messages: ChatUIMessage[]) {
  return new Chat<ChatUIMessage>({
    messages,
    transport: new DefaultChatTransport<ChatUIMessage>({
      api: '/api/chat',
      credentials: 'include',
      prepareSendMessagesRequest: ({ messages: all }) => {
        const last = all.at(-1)
        return {
          body: chatTurnBody({
            conversationId: currentId.value,
            siteId: props.siteId,
            message: { id: last?.id ?? '', text: last ? messageText(last) : '' },
            model: models.value.length > 1 ? selectedModel.value : undefined,
          }),
        }
      },
    }),
    onData: part => {
      if (part.type === 'data-conversation') {
        const conversation = part.data as ConversationInfo
        lastConversation = conversation
        if (currentId.value !== conversation.id) {
          currentId.value = conversation.id
          emit('update:conversationId', conversation.id)
        }
      } else if (part.type === 'data-status') {
        status.value = (part.data as { label: string }).label
      }
    },
    onFinish: () => {
      status.value = ''
      if (lastConversation) emit('answered', lastConversation)
    },
    onError: () => {
      status.value = ''
    },
  })
}

async function send() {
  const text = input.value.trim()
  if (!text || busy.value) return
  input.value = ''
  chat.value.clearError()
  await chat.value.sendMessage({ text })
}

function onKeydown(event: KeyboardEvent) {
  // Enter sends, Shift+Enter starts a new line.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void send()
}

function sourceLink(source: ChatSource) {
  return { name: 'file', params: { siteId: source.siteId, fileId: source.contentId } }
}

function modelLabel(model: string) {
  const [provider, ...rest] = model.split(':')
  return rest.length > 0 ? `${provider} / ${rest.join(':')}` : model
}

function friendlyError(error: Error) {
  try {
    const parsed = JSON.parse(error.message) as { error?: string; message?: string }
    return parsed.error || parsed.message || error.message
  } catch {
    return error.message || 'The AI response failed.'
  }
}
</script>

<template>
  <div class="chat-panel">
    <!-- Focusable so keyboard users can scroll the conversation; new messages are announced politely. -->
    <div class="chat-panel__messages" role="log" aria-live="polite" aria-label="Conversation" tabindex="0">
      <VAlert v-if="loadError" type="error" variant="tonal" density="comfortable">{{ loadError }}</VAlert>
      <div v-else-if="loadingConversation" class="chat-panel__loading">
        <VProgressCircular indeterminate size="24" width="2" aria-label="Loading conversation" />
      </div>
      <EmptyState
        v-else-if="shown.length === 0"
        :icon="ICONS.ai"
        :title="props.emptyTitle"
        :text="props.emptyText"
      />

      <article
        v-for="message in shown"
        :key="message.id"
        class="chat-message"
        :class="`chat-message--${message.role}`"
        :aria-label="message.role === 'user' ? 'You' : 'Clear Ideas'"
      >
        <div class="chat-message__role" aria-hidden="true">
          {{ message.role === 'user' ? 'You' : 'Clear Ideas' }}
        </div>
        <div class="chat-message__body">
          <MarkdownRenderer v-if="messageText(message)" :content="messageText(message)" />
          <div v-else class="chat-message__pending">
            <VProgressCircular aria-hidden="true" indeterminate size="16" width="2" color="primary" />
            <span>{{ status || 'Thinking…' }}</span>
          </div>
        </div>
        <div v-if="messageSources(message).length > 0" class="chat-message__sources">
          <span class="chat-message__sources-label">Sources</span>
          <ul aria-label="Sources">
            <li v-for="source in messageSources(message)" :key="source.contentId">
              <VChip
                :to="sourceLink(source)"
                :prepend-icon="fileIcon(source.contentType)"
                size="small"
                variant="outlined"
              >
                {{ source.name }}
                <span v-if="props.showSourceSites" class="chat-message__source-site"
                  >· {{ source.siteName }}</span
                >
              </VChip>
            </li>
          </ul>
        </div>
      </article>
      <div
        v-if="busy && status && shown.length > 0 && messageText(shown[shown.length - 1]!)"
        class="chat-panel__status"
      >
        {{ status }}
      </div>
      <VAlert
        v-if="chatError"
        type="error"
        variant="tonal"
        density="comfortable"
        closable
        @click:close="chat.clearError()"
      >
        {{ chatError }}
      </VAlert>
    </div>

    <form class="chat-panel__composer" @submit.prevent="send">
      <VTextarea
        v-model="input"
        class="chat-panel__input"
        :label="props.inputLabel"
        rows="1"
        max-rows="6"
        auto-grow
        hide-details
        variant="outlined"
        density="comfortable"
        autocomplete="off"
        @keydown="onKeydown"
      />
      <VSelect
        v-if="models.length > 1"
        v-model="selectedModel"
        :items="modelItems"
        label="Model"
        density="comfortable"
        variant="outlined"
        hide-details
        class="chat-panel__model"
      />
      <BaseButton v-if="busy" text="Stop" intent="secondary" @click="chat.stop()" />
      <BaseButton v-else type="submit" text="Send" intent="primary" :disabled="!input.trim()" />
    </form>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.chat-panel__messages {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: auto;
  padding: 2px;
}

.chat-panel__loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.chat-message {
  max-width: min(860px, 100%);
  padding: 14px 16px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 14px;
  background: rgb(var(--v-theme-surface));
}

.chat-message--user {
  align-self: flex-end;
  background: rgba(var(--v-theme-primary), 0.08);
}

.chat-message--assistant {
  align-self: flex-start;
}

.chat-message__role {
  margin-bottom: 6px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.chat-message__body :deep(.markdown-content) {
  margin-left: 0;
  margin-right: 0;
}

.chat-message__pending,
.chat-panel__status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.chat-panel__status {
  padding-inline: 4px;
  font-size: 0.875rem;
}

.chat-message__sources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.chat-message__sources-label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.chat-message__sources ul {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chat-message__source-site {
  margin-inline-start: 4px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.chat-panel__composer {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.chat-panel__input {
  flex: 1 1 auto;
}

.chat-panel__model {
  flex: 0 0 220px;
}

@media (max-width: 600px) {
  .chat-panel__composer {
    flex-wrap: wrap;
  }

  .chat-panel__model {
    flex-basis: 100%;
    order: -1;
  }
}
</style>
