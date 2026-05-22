<script setup lang="ts">
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { api } from '../../api/client'
import {
  createSiteChatRequestBody,
  getRenderableSiteChatMessages,
  getSiteChatMessageText,
  sanitizeSiteChatMessages,
} from '../../utils/siteChat'
import BaseButton from '../base/BaseButton.vue'
import MarkdownRenderer from '../base/MarkdownRenderer.vue'

const props = defineProps<{ siteId: string }>()
const input = ref('')
const modelOptions = ref<string[]>([])
const selectedModel = ref('')
const modelLoading = ref(false)
const localError = ref<unknown>(null)
const chat = shallowRef(createChat(props.siteId))
const messages = computed(() => chat.value.messages ?? [])
const status = computed(() => chat.value.status ?? 'ready')
const error = computed(() => localError.value ?? chat.value.error)
const errorMessage = computed(() => formatErrorMessage(error.value))
const modelItems = computed(() => modelOptions.value.map(model => ({
  title: modelLabel(model),
  value: model,
})))
const isBusy = computed(() => status.value === 'submitted' || status.value === 'streaming')
const visibleMessages = computed(() => getRenderableSiteChatMessages(messages.value, isBusy.value))

onMounted(loadModels)

watch(
  () => props.siteId,
  siteId => {
    localError.value = null
    chat.value = createChat(siteId)
    input.value = ''
  },
)

watch(selectedModel, () => {
  clearChatError()
})

async function loadModels() {
  modelLoading.value = true
  try {
    const response = await api<{ defaultModel: string; models: string[] }>('/chat/models')
    modelOptions.value = response.models
    selectedModel.value = response.models.includes(response.defaultModel)
      ? response.defaultModel
      : response.models[0] || ''
  } finally {
    modelLoading.value = false
  }
}

async function sendMessage() {
  const text = input.value.trim()
  if (!text || isBusy.value) return
  clearChatError()
  input.value = ''
  try {
    await chat.value.sendMessage({ text })
  } catch (error) {
    localError.value = error
  }
}

function resetChat() {
  clearPersistedMessages(props.siteId)
  localError.value = null
  chat.value = createChat(props.siteId)
  input.value = ''
}

function clearChatError() {
  localError.value = null
  chat.value.clearError()
}

function createChat(siteId: string) {
  return new Chat({
    messages: loadPersistedMessages(siteId),
    onError: error => {
      localError.value = error
    },
    onFinish: ({ messages, isAbort, isError }) => {
      if (!isAbort && !isError) persistMessages(siteId, messages)
    },
    transport: new DefaultChatTransport({
      api: `/api/sites/${siteId}/chat`,
      credentials: 'include',
      prepareSendMessagesRequest: ({ messages }: any) => ({
        body: createSiteChatRequestBody({
          messages,
          selectedModel: selectedModel.value || undefined,
        }),
      }),
    }),
  })
}

function chatStorageKey(siteId: string) {
  return `clearideas-ce:site-chat:${siteId}`
}

function loadPersistedMessages(siteId: string): UIMessage[] {
  try {
    const raw = localStorage.getItem(chatStorageKey(siteId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return sanitizeSiteChatMessages(parsed)
  } catch {
    return []
  }
}

function persistMessages(siteId: string, value: UIMessage[]) {
  try {
    const sanitized = sanitizeSiteChatMessages(value)
    if (sanitized.length === 0) return
    localStorage.setItem(chatStorageKey(siteId), JSON.stringify(sanitized))
  } catch {
    // Ignore local storage quota/privacy failures; chat still works for the current tab.
  }
}

function clearPersistedMessages(siteId: string) {
  try {
    localStorage.removeItem(chatStorageKey(siteId))
  } catch {
    // No-op.
  }
}

function modelLabel(model: string) {
  return model.replace(/^openai:/, 'OpenAI / ').replace(/^anthropic:/, 'Anthropic / ')
}

function formatErrorMessage(value: unknown) {
  const raw = value instanceof Error ? value.message : String(value || '')
  try {
    const parsed = JSON.parse(raw)
    return parsed.error || parsed.message || raw
  } catch {
    return raw || 'The AI response failed.'
  }
}
</script>

<template>
  <div class="site-chat">
    <div class="site-chat__header">
      <div class="site-chat__intro">
        <div class="site-chat__eyebrow">Site AI</div>
        <p class="site-chat__subtitle">
          Ask questions about this site. Responses are not saved.
        </p>
      </div>
      <div class="site-chat__header-actions">
        <div class="site-chat__model-wrap">
          <VSelect
            v-if="modelOptions.length > 1"
            v-model="selectedModel"
            :items="modelItems"
            item-title="title"
            item-value="value"
            label="Model"
            density="compact"
            variant="outlined"
            hide-details
            :loading="modelLoading"
            class="site-chat__model"
          />
        </div>
        <BaseButton class="site-chat__clear" text="Clear" variant="text" color="secondary" slim @click="resetChat" />
      </div>
    </div>

    <div class="site-chat__messages">
      <VAlert
        v-if="error"
        class="site-chat__error"
        type="error"
        variant="tonal"
        density="comfortable"
        closable
        @click:close="clearChatError"
      >
        {{ errorMessage }}
      </VAlert>

      <VEmptyState
        v-if="visibleMessages.length === 0"
        title="Ask about this site"
        text="Try asking for a summary, a file lookup, or details from a PDF that has extracted text."
      >
        <template #media>
          <VIcon icon="fasl fa-sparkles" color="info" />
        </template>
      </VEmptyState>

      <div
        v-for="message in visibleMessages"
        :key="message.id"
        class="site-chat-message"
        :class="`site-chat-message--${message.role}`"
      >
        <div class="site-chat-message__role">{{ message.role === 'user' ? 'You' : 'Clear Ideas' }}</div>
        <div class="site-chat-message__body">
          <MarkdownRenderer v-if="getSiteChatMessageText(message)" :content="getSiteChatMessageText(message)" />
          <div v-else class="site-chat-message__pending">
            <VProgressCircular indeterminate size="16" width="2" color="primary" />
            <span>Working...</span>
          </div>
        </div>
      </div>
    </div>

    <form class="site-chat__composer" @submit.prevent="sendMessage">
      <VTextField
        v-model="input"
        label="Ask this site"
        hide-details
        variant="outlined"
        density="comfortable"
        :disabled="isBusy"
        autocomplete="off"
      />
      <BaseButton
        type="submit"
        text="Send"
        color="primary"
        :loading="isBusy"
        :disabled="!input.trim() || isBusy"
      />
    </form>
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

.site-chat__header-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  min-height: 56px;
}

.site-chat__intro {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  min-height: 56px;
}

.site-chat__model-wrap {
  display: flex;
  align-items: center;
  min-height: 56px;
  width: 280px;
}

.site-chat__model {
  width: 100%;
}

.site-chat__model :deep(.v-field) {
  align-items: center;
}

.site-chat__model :deep(.v-field__input) {
  min-height: 40px;
  padding-top: 0;
  padding-bottom: 0;
}

.site-chat__clear {
  flex: 0 0 auto;
}

.site-chat__error {
  flex: 0 0 auto;
  align-self: stretch;
}

.site-chat__error :deep(.v-alert__content) {
  min-height: auto;
  padding-top: 1px;
}

.site-chat__error :deep(.v-alert__prepend),
.site-chat__error :deep(.v-alert__close) {
  align-self: center;
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

.site-chat__messages {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 12px;
  overflow: auto;
}

.site-chat-message {
  max-width: min(860px, 100%);
  padding: 14px 16px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 14px;
  background: rgb(var(--v-theme-surface));
}

.site-chat-message--user {
  align-self: flex-end;
  background: rgba(var(--v-theme-primary), 0.08);
}

.site-chat-message--assistant {
  align-self: flex-start;
}

.site-chat-message__role {
  margin-bottom: 6px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.site-chat-message__body :deep(.markdown-content) {
  margin-left: 0;
  margin-right: 0;
}

.site-chat-message__pending {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.site-chat__composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
}

@media (max-width: 700px) {
  .site-chat {
    padding: 12px;
  }

  .site-chat__composer {
    grid-template-columns: 1fr;
  }

  .site-chat__header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    min-height: 0;
  }

  .site-chat__header-actions {
    justify-content: space-between;
    min-height: 0;
  }

  .site-chat__model-wrap {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  .site-chat__model {
    width: 100%;
  }
}
</style>
