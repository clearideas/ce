<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { DateTime } from 'luxon'
import { useRouter } from 'vue-router'
import IconCheckbox from '../base/IconCheckbox.vue'
import TagOverflowRow from '../base/TagOverflowRow.vue'
import BookmarksEmptyState from './BookmarksEmptyState.vue'
import ContentEmptyState from './ContentEmptyState.vue'
import ContentInfoIcons from './ContentInfoIcons.vue'
import ContentTileLoadingState from './ContentTileLoadingState.vue'
import { useContentStore, useSiteStore } from '../../stores'

type ContentDisplayOptions = 'default' | 'latest' | 'bookmarks'
type ContentItem = any
interface Props { siteId?: string; id?: string; siteName?: string; display: ContentDisplayOptions }
const props = defineProps<Props>()
const selectedIds = defineModel<string[]>('selected', { default: [] })
const sortKey = defineModel<'rank' | 'name' | 'size' | 'updatedAt'>('sortKey', { default: 'rank' })
const sortOrder = defineModel<'asc' | 'desc'>('sortOrder', { default: 'asc' })
const nameFilterType = defineModel<'contains' | 'startsWith'>('nameFilterType', { default: 'contains' })
const nameFilterValue = defineModel<string>('nameFilterValue', { default: '' })
const mimeTypes = defineModel<string[]>('mimeTypes', { default: [] })
const sizeOperator = defineModel<'gt' | 'lt'>('sizeOperator', { default: 'gt' })
const sizeValue = defineModel<string>('sizeValue', { default: '' })
const updatedOperator = defineModel<'before' | 'after'>('updatedOperator', { default: 'after' })
const updatedDate = defineModel<string>('updatedDate', { default: '' })
const contentStore = useContentStore()
const siteStore = useSiteStore()
const router = useRouter()
const loading = computed(() => !!(siteStore.loadingSites || contentStore.loading))
const canEditContent = computed(() =>
  ['owner', 'admin', 'editor'].includes(siteStore.currentSite?.currentUserRole || ''),
)
const contentLevel = computed(() => contentStore.ancestors.length)
const contents = computed<ContentItem[]>(() => {
  switch (props.display) {
    case 'latest': return contentStore.latestContents
    case 'bookmarks': return contentStore.bookmarksWithIcons
    default: return [...contentStore.contents].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
  }
})
const normalizedFilter = computed(() => String(nameFilterValue.value ?? '').trim().toLowerCase())
const filteredContents = computed<ContentItem[]>(() => {
  const normalizedMimeFilters = (mimeTypes.value ?? []).map(type => String(type).trim().toLowerCase()).filter(Boolean)
  return contents.value.filter(content => {
    const name = content.name?.toLowerCase() ?? ''
    if (normalizedFilter.value) {
      const nameMatch = nameFilterType.value === 'startsWith' ? name.startsWith(normalizedFilter.value) : name.includes(normalizedFilter.value)
      if (!nameMatch) return false
    }
    if (normalizedMimeFilters.length > 0) {
      const contentType = String(content.contentType ?? '').toLowerCase()
      if (!contentType || !normalizedMimeFilters.includes(contentType)) return false
    }
    const parsedSize = Number(String(sizeValue.value ?? '').trim())
    if (String(sizeValue.value ?? '').trim().length > 0 && Number.isFinite(parsedSize) && parsedSize >= 0) {
      const contentSize = Number(content.size ?? NaN)
      if (!Number.isFinite(contentSize)) return false
      if (sizeOperator.value === 'gt' && !(contentSize > parsedSize * 1024)) return false
      if (sizeOperator.value === 'lt' && !(contentSize < parsedSize * 1024)) return false
    }
    const dateFilter = String(updatedDate.value ?? '').trim()
    if (dateFilter.length > 0) {
      const updatedMs = new Date(content.updatedAt as string).getTime()
      if (!Number.isFinite(updatedMs)) return false
      if (updatedOperator.value === 'before' && updatedMs >= new Date(dateFilter).setHours(23, 59, 59, 999)) return false
      if (updatedOperator.value === 'after' && updatedMs <= new Date(dateFilter).setHours(0, 0, 0, 0)) return false
    }
    return true
  })
})
const sortedAndFilteredContents = computed(() => {
  const sorted = [...filteredContents.value]
  const direction = sortOrder.value === 'desc' ? -1 : 1
  sorted.sort((a, b) => {
    if (sortKey.value === 'rank') return (Number(a.rank ?? 0) - Number(b.rank ?? 0)) * direction
    if (sortKey.value === 'name') return String(a.name ?? '').localeCompare(String(b.name ?? '')) * direction
    if (sortKey.value === 'size') return (Number(a.size ?? 0) - Number(b.size ?? 0)) * direction
    return (new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime()) * direction
  })
  return sorted
})
const hasAnyFilters = computed(() => Boolean(normalizedFilter.value || mimeTypes.value.length || sizeValue.value || updatedDate.value))
const ghostItems = computed(() => Math.max(0, 4 - (sortedAndFilteredContents.value.length % 4 || 4)))
function formatItemWithPreset(_index: number) { return '' }
function navigateToItem(content: ContentItem) {
  if (content.kind === 'file') void router.push({ name: 'file', params: { siteId: props.siteId ?? content.site, fileId: content.id } })
  else void router.push({ name: 'site-folder-tab', params: { siteId: props.siteId ?? content.site, folderId: content.id, siteTab: 'content' } })
}
async function loadContent() { if (props.siteId) { await siteStore.getSitesIfRequired(); await siteStore.setCurrentSite(props.siteId); contentStore.activeFolderId = props.id } }
watch(() => [props.display, props.siteId, props.id], loadContent, { immediate: true })
watch(canEditContent, canEdit => {
  if (!canEdit) selectedIds.value = []
}, { immediate: true })
onMounted(loadContent)
</script>

<template>
  <div class="content-tiles">
    <ContentTileLoadingState v-if="loading" :show-checkbox="props.display !== 'bookmarks' && canEditContent" />
    <VCard v-else v-for="content in sortedAndFilteredContents" :key="content.id" class="content-tile-item" :data-content-drag-id="content.id" variant="flat" :ripple="false" @click="navigateToItem(content)">
      <div v-if="props.display !== 'bookmarks' && canEditContent" class="tile-selection" @click.stop><IconCheckbox :id="content.id" v-model="selectedIds" :size="16" /></div>
      <div class="icon-wrapper">
        <div class="numbering">{{ formatItemWithPreset((content.rank ?? 0) - 1) }}</div>
        <div class="icon"><VImg v-if="content.attributes?.thumbnail" :src="`data:image/png;base64,${content.attributes.thumbnail}`" contain height="90" width="90" /><div v-else class="d-flex align-center justify-center" style="height: 90px; width: 90px"><VIcon :icon="`fasl ${content.attributes.icon}`" size="xxx-large" /></div></div>
        <div class="invisible" />
      </div>
      <div class="title-wrapper"><div class="title">{{ content.name }}</div></div>
      <div v-if="(content.tags ?? []).length > 0" class="content-tile-tags"><TagOverflowRow :items="(content.tags ?? []).map((tag: string) => ({ key: tag, text: tag, color: 'secondary' }))" size="x-small" :max-visible-chars="18" /></div>
      <div class="tile-footer"><div class="subtitle">{{ content.updatedAt && DateTime.fromISO(content.updatedAt.toString()).toRelative() }}</div><ContentInfoIcons :item="content" menu-only /></div>
    </VCard>
    <template v-if="!loading"><div v-for="n in ghostItems" :key="`ghost-${n}`" class="ghost" /></template>
    <div v-if="hasAnyFilters && (contents.length ?? 0) > 0 && (sortedAndFilteredContents.length ?? 0) === 0" class="text-medium-emphasis pa-4">No matching content.</div>
    <ContentEmptyState :id="props.id" v-if="props.display !== 'bookmarks' && !loading && (contents.length ?? 0) === 0" :site-id="props.siteId!" :loading="loading" show-new-folder show-drop-zone />
    <BookmarksEmptyState v-if="props.display === 'bookmarks' && !loading && (contents.length ?? 0) === 0" />
  </div>
</template>

<style scoped>
.content-tile-item { position: relative; }
.content-tile-tags { width: 100%; padding: 0 8px 32px; min-height: 24px; display: flex; justify-content: flex-start; box-sizing: border-box; }
.tile-selection { position: absolute; top: 8px; left: 8px; z-index: 1; }
.tile-footer { position: absolute; right: 10px; bottom: 10px; left: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tile-footer > .subtitle { flex: 1 1 auto; min-width: 0; padding: 0 12px 0 0; }
.tile-footer > :deep(.info-icons) { width: auto; justify-content: flex-end; padding: 0; margin: 0; overflow: visible; }
.tile-footer > :deep(.info-icon:last-child) { padding-right: 2px; }
.content-tile-tags :deep(.tag-overflow-row) { justify-content: flex-start; }
</style>
