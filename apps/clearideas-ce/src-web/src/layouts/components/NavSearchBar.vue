<script setup lang="ts">
import HandlebarsTextarea from '../../components/base/HandlebarsTextarea.vue'
import { useContentStore, useSiteStore } from '../../stores'
import { hasIncompleteMetadataToken } from '../../utils/metadataSearch'
import { useMagicKeys } from '@vueuse/core'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'

const siteStore = useSiteStore()
const contentStore = useContentStore()
const { mobile } = useDisplay()
const route = useRoute()
const router = useRouter()
const isExpanded = defineModel<boolean>({ default: false })
const searchInput = ref<InstanceType<typeof HandlebarsTextarea> | null>(null)
const focusRetryTimer = ref<number | null>(null)

const inputWidth = computed(() => (mobile.value ? '100%' : '600px'))
const placeholderText = computed(() =>
  siteStore.currentSite != null ? `Search ${siteStore.currentSite.name}` : 'Search all sites',
)
const siteId = computed(() => {
  const value = route.params.siteId
  if (Array.isArray(value)) return value[0] ?? ''
  return typeof value === 'string' ? value : ''
})

function toggleExpand(expand = true) {
  isExpanded.value = expand
}

async function focusSearchInput(attempt = 0) {
  await nextTick()

  const editor = searchInput.value?.getEditorElement?.()
  if (!editor) {
    if (attempt >= 6) return

    if (focusRetryTimer.value != null) window.clearTimeout(focusRetryTimer.value)
    focusRetryTimer.value = window.setTimeout(() => {
      void focusSearchInput(attempt + 1)
    }, 50)
    return
  }

  searchInput.value?.focus()
}

const { ctrl_k, meta_k } = useMagicKeys({
  passive: false,
  onEventFired(e) {
    if (e.ctrlKey && e.key === 'k' && e.type === 'keydown') e.preventDefault()
  },
})

watch([ctrl_k, meta_k], () => {
  toggleExpand(true)
})

watch(
  isExpanded,
  expanded => {
    if (expanded) void focusSearchInput()
  },
  { flush: 'post' },
)

watch(
  () => contentStore.showSearchResults,
  newVal => {
    if (newVal && isExpanded.value) {
      void focusSearchInput()
      return
    }

    if (!newVal) {
      isExpanded.value = false
      resetInput()
    }
  },
)

async function executeSearch(text: string) {
  if (hasIncompleteMetadataToken(text)) return
  if (text.trim().length === 0) return

  contentStore.searchQuery = text
  contentStore.showSearchResults = true

  if (siteId.value) {
    await router.push(`/site/${siteId.value}`)
    await siteStore.setCurrentSite(siteId.value)
  }

  await contentStore.search(String(siteId.value || ''))
}

async function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return

  event.preventDefault()
  await executeSearch(contentStore.searchQuery)
}

function resetInput() {
  contentStore.searchQuery = ''
  contentStore.searchResults = []
}

function closeSearch() {
  contentStore.showSearchResults = false
  resetInput()
  isExpanded.value = false
}

onUnmounted(() => {
  if (focusRetryTimer.value != null) window.clearTimeout(focusRetryTimer.value)
})
</script>

<template>
  <div class="d-flex search-shell" :class="{ 'is-expanded': isExpanded }">
    <Transition name="search-morph" mode="out-in" @after-enter="focusSearchInput()">
      <button
        v-if="!isExpanded"
        type="button"
        class="search-collapsed-button"
        aria-label="Search content"
        @click="toggleExpand(true)"
      >
        <VIcon icon="fasl fa-magnifying-glass" size="small" />
      </button>
      <div
        v-else
        :style="{ width: inputWidth }"
        class="flex-full-width search-text-box d-flex is-active"
        @click="toggleExpand(true)"
      >
        <VIcon icon="fasl fa-magnifying-glass" class="search-icon" />
        <HandlebarsTextarea
          ref="searchInput"
          v-model="contentStore.searchQuery"
          class="search-editor"
          :placeholder="placeholderText"
          :persistent-placeholder="true"
          density="compact"
          :rows="1"
          :max-rows="3"
          :auto-grow="true"
          :allow-line-breaks="false"
          variant="plain"
          :hide-details="true"
          :highlight-mode="'metadataSearch'"
          @focus="toggleExpand()"
          @keydown="handleKeydown"
        />
        <div class="search-clear">
          <VIcon
            v-if="!mobile && isExpanded && contentStore.searchQuery.length > 0"
            icon="fasl fa-xmark"
            v-tippy="{ content: 'Clear Search', placement: 'bottom' }"
            @click="resetInput()"
          />
          <VIcon
            v-if="mobile && isExpanded"
            icon="fasl fa-xmark"
            v-tippy="{ content: 'Close search', placement: 'bottom' }"
            aria-label="Close search"
            @click.stop="closeSearch()"
          />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.search-shell {
  --search-navbar-max-height: calc(var(--ci-navbar-height) - 12px);
  --search-editor-max-height: calc(var(--search-navbar-max-height) - 18px);
  position: relative;
  z-index: 30;
  max-width: 100%;
}

.search-text-box {
  transition: width 0.3s ease;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 18px;
  min-height: 38px;
  max-height: var(--search-navbar-max-height);
  padding: 0 10px 0 10px;
  gap: 8px;
  background: rgb(var(--v-theme-surface));
  align-items: center;
  overflow: hidden;
  max-width: 100%;
}

.search-collapsed-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  min-width: 36px;
  height: 36px;
  border-radius: 9999px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  cursor: pointer;
}

.search-collapsed-button :deep(.v-icon) {
  font-size: 13px;
}

.search-collapsed-button:hover {
  border-color: rgba(var(--v-theme-primary), 0.45);
  color: rgb(var(--v-theme-primary));
}

.search-icon {
  font-size: 13px;
  opacity: 0.8;
}

.search-text-box.is-active {
  border-color: rgb(var(--v-theme-primary));
  border-radius: 6px;
}

.search-text-box.is-active .search-icon {
  color: rgb(var(--v-theme-primary));
}

.search-editor {
  flex: 1;
  min-width: 0;
}

.search-editor :deep(.handlebars-textarea-editor) {
  min-height: 20px;
  max-height: var(--search-editor-max-height);
  line-height: 20px;
  padding-top: 9px;
  padding-bottom: 9px;
  padding-right: 0 !important;
  overflow-y: auto;
}

.search-editor :deep(.handlebars-textarea-placeholder) {
  min-height: 38px;
  padding-top: 9px !important;
  padding-bottom: 9px !important;
  display: flex;
  align-items: center;
}

.search-clear {
  width: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.search-text-box.is-active .search-clear :deep(.v-icon) {
  color: rgb(var(--v-theme-primary));
}

.search-morph-enter-active,
.search-morph-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.search-morph-enter-from,
.search-morph-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

@media (max-width: 720px) {
  .search-shell.is-expanded {
    flex: 1 1 auto;
    width: 100%;
  }
}
</style>
