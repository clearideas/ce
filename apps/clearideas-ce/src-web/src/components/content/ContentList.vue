<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { DateTime } from 'luxon'
import prettyBytes from 'pretty-bytes'
import { useRouter } from 'vue-router'
import IconCheckbox from '../base/IconCheckbox.vue'
import ContentListLoadingState from '../base/ContentListLoadingState.vue'
import TableFooter from '../base/TableFooter.vue'
import TagOverflowRow from '../base/TagOverflowRow.vue'
import DropZone from './actions/DropZone.vue'
import BookmarksEmptyState from './BookmarksEmptyState.vue'
import ContentEmptyState from './ContentEmptyState.vue'
import ContentInfoIcons from './ContentInfoIcons.vue'
import ContentListItem from './ContentListItem.vue'
import EncryptedPDFIcon from './EncryptedPDFIcon.vue'
import { useContentStore, useProfileStore, useSiteStore } from '../../stores'

type ContentDisplayOptions = 'default' | 'latest' | 'bookmarks'
type ContentItem = any

interface Props {
  siteId?: string
  id?: string
  siteName?: string
  display: ContentDisplayOptions
}

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
const profileStore = useProfileStore()
const router = useRouter()
const { mobile } = useDisplay()
const page = ref(1)

const loading = computed(() => siteStore.loadingSites === true || contentStore.loading === true)
const canEditContent = computed(() =>
  ['owner', 'admin', 'editor'].includes(siteStore.currentSite?.currentUserRole || ''),
)
const headers = computed<any[]>(() => [
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Size', key: 'size', align: 'start', mobileHide: true },
  { title: 'Updated', key: 'updatedAt', align: 'start', mobileHide: true },
])
const computedHeaders = computed(() => mobile.value ? headers.value.filter(header => !header.mobileHide) : headers.value)
const contentLevel = computed(() => (contentStore.ancestors ?? []).length)

const contents = computed<ContentItem[]>(() => {
  switch (props.display) {
    case 'latest': return [...contentStore.latestContents].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
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
      const parsedSizeBytes = parsedSize * 1024
      const contentSize = Number(content.size ?? NaN)
      if (!Number.isFinite(contentSize)) return false
      if (sizeOperator.value === 'gt' && !(contentSize > parsedSizeBytes)) return false
      if (sizeOperator.value === 'lt' && !(contentSize < parsedSizeBytes)) return false
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
const sortByState = computed({
  get: () => sortKey.value === 'rank' ? [] : [{ key: sortKey.value, order: sortOrder.value }],
  set: value => {
    const first = Array.isArray(value) ? value[0] : undefined
    if (first?.key) {
      sortKey.value = first.key
      sortOrder.value = first.order === 'desc' ? 'desc' : 'asc'
    }
  },
})
const hasAnyFilters = computed(() => Boolean(normalizedFilter.value || mimeTypes.value.length || sizeValue.value || updatedDate.value))
const selectableContentIds = computed(() => filteredContents.value.map(item => item.id))
const allSelectableItemsSelected = computed(() => selectableContentIds.value.length > 0 && selectableContentIds.value.every(id => selectedIds.value.includes(id)))
const rowProps = (obj: { item: { id: string } }) => selectedIds.value.includes(obj.item.id) ? { class: 'data-table-item-selected' } : { class: 'data-table-item' }

function getContentDisplayName(item: ContentItem): string {
  return item.name
}
function getContentTagItems(item: ContentItem) { return (item.tags ?? []).map((tag: string) => ({ key: tag, text: tag, color: 'secondary' })) }
function toggleSelectAllItems(selected: boolean) { selectedIds.value = selected ? [...selectableContentIds.value] : [] }
function navigateToContent(item: ContentItem) {
  if (item.kind === 'file') void router.push({ name: 'file', params: { siteId: props.siteId ?? item.site, fileId: item.id } })
  else void router.push({ name: 'site-folder-tab', params: { siteId: props.siteId ?? item.site, folderId: item.id, siteTab: 'content' } })
}
async function loadContent() {
  if (!props.siteId) return
  await siteStore.getSitesIfRequired()
  await siteStore.setCurrentSite(props.siteId)
  contentStore.activeFolderId = props.id
}
watch(() => [props.display, props.siteId, props.id], loadContent, { immediate: true })
watch(canEditContent, canEdit => {
  if (!canEdit) selectedIds.value = []
}, { immediate: true })
watch(() => [nameFilterType.value, nameFilterValue.value, mimeTypes.value.join('|'), sizeOperator.value, sizeValue.value, updatedOperator.value, updatedDate.value, sortKey.value, sortOrder.value], () => { page.value = 1 })
onMounted(loadContent)
</script>

<template>
  <div class="list-with-footer">
    <div class="list-scroll">
      <div class="data-table-wrapper">
        <VDataTable
          v-model:page="page"
          v-model:items-per-page="profileStore.sitePageSize"
          v-model:sort-by="sortByState"
          :items="filteredContents"
          :headers="computedHeaders"
          :loading="loading"
          width="100%"
          class="flex-grow-1 flex-shrink-1"
          :class="filteredContents.length === 0 && !loading ? 'no-data' : ''"
          :row-props="rowProps"
          return-object
          @click:row="(_event: Event, row: any) => navigateToContent(row.item)"
        >
          <template #header.name="{ column, toggleSort }">
            <div class="content-name-header" @click="toggleSort(column)">
              <IconCheckbox v-if="canEditContent" :model-value="allSelectableItemsSelected" :disabled="selectableContentIds.length === 0" :size="16" class="content-name-header__checkbox" @click.stop @update:model-value="toggleSelectAllItems(Boolean($event))" />
              <span class="content-name-header__label">Name</span>
            </div>
          </template>
          <template #item.name="{ item }">
            <template v-if="item.kind === 'file'">
              <ContentListItem :id="item.id" :prepend-icon="`fasl ${item.attributes.icon}`">
                <template #text><div class="d-flex flex-column flex-sm-row align-sm-center"><span>{{ getContentDisplayName(item) }}</span><div v-if="(item.tags ?? []).length > 0" class="content-list-tags mt-1 mt-sm-0 ms-sm-2 min-w-0"><TagOverflowRow :items="getContentTagItems(item)" size="x-small" /></div></div></template>
                <template #checkbox v-if="canEditContent"><IconCheckbox :id="item.id" v-model="selectedIds" :size="16" /></template>
                <template #subtitle v-if="mobile">{{ typeof item.updatedAt === 'string' ? DateTime.fromISO(item.updatedAt).toRelative() : '' }} {{ item.size || item.size === 0 ? `(${prettyBytes(item.size)})` : '' }}</template>
                <template #append><ContentInfoIcons :item="item" /></template>
              </ContentListItem>
            </template>
            <template v-else>
              <DropZone :id="item.id" :site-id="item.site" show-as-item disable-on-click drop-style="folder" :prepend-icon="`fasl ${item.attributes.icon}`" class="folder-drop-zone">
                <template #text><div class="d-flex flex-column flex-sm-row align-sm-center"><span>{{ getContentDisplayName(item) }}</span></div></template>
                <template #checkbox v-if="canEditContent"><IconCheckbox :id="item.id" v-model="selectedIds" :size="16" /></template>
                <template #append><ContentInfoIcons :item="item" /></template>
              </DropZone>
            </template>
          </template>
          <template #item.size="{ item }"><div class="text-secondary mx-2">{{ item.size || item.size === 0 ? prettyBytes(item.size) : 'Folder' }}<EncryptedPDFIcon :file="item" /></div></template>
          <template #item.updatedAt="{ item }"><div class="text-secondary mx-2">{{ typeof item.updatedAt === 'string' ? DateTime.fromISO(item.updatedAt).toRelative() : '' }}</div></template>
          <template #loading><ContentListLoadingState :rows="10" variant="content" /></template>
          <template #bottom />
          <template #no-data>
            <div v-if="hasAnyFilters && (contents.length ?? 0) > 0" class="text-medium-emphasis pa-4">No matching content.</div>
            <ContentEmptyState v-else-if="props.display !== 'bookmarks'" :id="props.id" :site-id="props.siteId!" :loading="loading" show-new-folder show-drop-zone />
            <BookmarksEmptyState v-else-if="props.display === 'bookmarks' && !loading && (contents.length ?? 0) === 0" />
          </template>
        </VDataTable>
      </div>
    </div>
    <div class="list-footer"><TableFooter v-model:page="page" v-model:items-per-page="profileStore.sitePageSize" :items="filteredContents" item-label="Items" /></div>
  </div>
</template>

<style scoped>
.list-with-footer { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.list-scroll { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
.list-scroll .data-table-wrapper { flex: 1; min-height: 0; margin-bottom: 0; }
.data-table-wrapper :deep(.v-data-table-progress) { display: none; }
.data-table-wrapper :deep(.v-data-table-rows-loading), .data-table-wrapper :deep(.v-data-table-rows-loading td), .data-table-wrapper :deep(.v-data-table-rows-loading .v-data-table__td) { vertical-align: middle !important; }
.data-table-wrapper :deep(.v-data-table-rows-loading > td), .data-table-wrapper :deep(.v-data-table-rows-loading .v-data-table__td) { padding: 0 !important; }
.data-table-wrapper :deep(.v-data-table-rows-loading .content-list-loading-state) { margin: 0 !important; }
.list-footer { flex-shrink: 0; }
.content-list-tags :deep(.tag-overflow-row) { justify-content: flex-start; }
.content-name-header { display: inline-flex; align-items: center; gap: 10px; min-width: 0; cursor: pointer; }
.content-name-header__checkbox { flex: 0 0 auto; }
.content-name-header__label { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
</style>
