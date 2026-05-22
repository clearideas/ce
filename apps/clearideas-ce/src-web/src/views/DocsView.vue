<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MarkdownRenderer from '../components/base/MarkdownRenderer.vue'

type DocsPage = { title: string; slug: string; description?: string }
type DocsSection = { title: string; pages: DocsPage[] }
type DocsManifest = { title: string; description: string; sections: DocsSection[] }

const route = useRoute()
const router = useRouter()
const manifest = ref<DocsManifest | null>(null)
const markdown = ref('')
const loading = ref(true)
const error = ref('')
const activeSlug = computed(() => {
  const raw = route.params.slug
  const value = Array.isArray(raw) ? raw.join('/') : String(raw ?? '')
  return value.replace(/^\/+|\/+$/g, '') || 'getting-started'
})
const pages = computed(() => manifest.value?.sections.flatMap(section => section.pages) ?? [])
const activePage = computed(() => pages.value.find(page => page.slug === activeSlug.value) ?? pages.value[0])

async function loadManifest() {
  const response = await fetch('/docs/index.json', { credentials: 'same-origin' })
  if (!response.ok) throw new Error('Could not load documentation index')
  manifest.value = await response.json()
}

async function loadPage() {
  if (!manifest.value) await loadManifest()
  loading.value = true
  error.value = ''
  try {
    const page = activePage.value
    if (!page) throw new Error('Documentation page not found')
    if (page.slug !== activeSlug.value) {
      await router.replace({ name: 'docs-page', params: { slug: page.slug } })
      return
    }
    const response = await fetch(`/docs/${page.slug}.md`, { credentials: 'same-origin' })
    if (!response.ok) throw new Error('Documentation page not found')
    markdown.value = await response.text()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not load documentation'
  } finally {
    loading.value = false
  }
}

onMounted(loadPage)
watch(activeSlug, loadPage)
</script>

<template>
  <div class="docs-view">
    <aside class="docs-sidebar">
      <div class="docs-sidebar-title">
        <span class="eyebrow">Documentation</span>
        <h1>{{ manifest?.title ?? 'Clear Ideas Docs' }}</h1>
        <p>{{ manifest?.description }}</p>
      </div>
      <div v-for="section in manifest?.sections ?? []" :key="section.title" class="docs-section">
        <h2>{{ section.title }}</h2>
        <RouterLink
          v-for="page in section.pages"
          :key="page.slug"
          class="docs-link"
          :class="{ active: page.slug === activeSlug }"
          :to="{ name: 'docs-page', params: { slug: page.slug } }"
        >
          <span>{{ page.title }}</span>
          <small>{{ page.description }}</small>
        </RouterLink>
      </div>
    </aside>
    <main class="docs-content-card">
      <VProgressCircular v-if="loading" indeterminate color="primary" />
      <VAlert v-else-if="error" type="error" icon="fasl fa-triangle-exclamation">{{ error }}</VAlert>
      <MarkdownRenderer v-else :content="markdown" />
    </main>
  </div>
</template>

<style scoped>
.docs-view {
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
  gap: 28px;
  align-items: start;
  box-sizing: border-box;
  max-width: 100%;
  min-height: 0;
  padding: 28px;
  width: 100%;
}

.docs-sidebar {
  box-sizing: border-box;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding-right: 4px;
  position: relative;
  width: 100%;
  z-index: 1;
}

.docs-sidebar-title {
  margin-bottom: 24px;
}

.eyebrow {
  color: rgb(var(--v-theme-primary));
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.docs-sidebar h1 {
  margin: 6px 0 8px;
  font-size: 1.45rem;
}

.docs-sidebar p {
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 0.92rem;
  line-height: 1.5;
}

.docs-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 22px;
}

.docs-section h2 {
  color: rgba(var(--v-theme-on-surface), 0.54);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin: 0 0 8px;
  text-transform: uppercase;
}

.docs-link {
  border-radius: 12px;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 14px;
  text-decoration: none;
}

.docs-link:hover,
.docs-link.active {
  background: rgba(var(--v-theme-primary), 0.1);
}

.docs-link span {
  font-weight: 650;
}

.docs-link small {
  color: rgba(var(--v-theme-on-surface), 0.58);
  line-height: 1.35;
}

.docs-content-card {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 16px;
  box-sizing: border-box;
  min-height: 60vh;
  min-width: 0;
  overflow: auto;
  padding: 34px 40px;
  position: relative;
  width: 100%;
  z-index: 0;
}

.docs-content-card :deep(.markdown-content) {
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
}

.docs-content-card :deep(pre),
.docs-content-card :deep(table) {
  max-width: 100%;
}

@media (max-width: 960px) {
  .docs-view {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 18px;
  }

  .docs-sidebar {
    flex: 0 0 auto;
    overflow: visible;
    padding-right: 0;
  }

  .docs-content-card {
    flex: 1 1 auto;
    min-height: auto;
    overflow: visible;
    padding: 24px;
  }
}

@media (max-width: 600px) {
  .docs-view {
    gap: 14px;
    padding: 12px;
  }

  .docs-sidebar-title {
    margin-bottom: 18px;
  }

  .docs-sidebar h1 {
    font-size: 1.2rem;
  }

  .docs-section {
    gap: 8px;
    margin-bottom: 18px;
  }

  .docs-link {
    padding: 13px 14px;
  }

  .docs-content-card {
    border-radius: 14px;
    padding: 18px;
  }
}
</style>
