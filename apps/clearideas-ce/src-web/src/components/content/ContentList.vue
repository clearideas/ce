<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { DateTime } from 'luxon'
import prettyBytes from 'pretty-bytes'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import IconCheckbox from '../base/IconCheckbox.vue'
import ItemLink from '../base/ItemLink.vue'
import ContentListLoadingState from '../base/ContentListLoadingState.vue'
import TableFooter from '../base/TableFooter.vue'
import TagOverflowRow from '../base/TagOverflowRow.vue'
import DropZone from './actions/DropZone.vue'
import ContentEmptyState from './ContentEmptyState.vue'
import ContentInfoIcons from './ContentInfoIcons.vue'
import ContentListItem from './ContentListItem.vue'
import EncryptedPDFIcon from './EncryptedPDFIcon.vue'
import { applyContentFilters, useContentFilters } from '../../composables/useContentFilters'
import { useContentStore, useSiteStore } from '../../stores'
import { usePreferences } from '../../composables/usePreferences'
import { siteContentPermissions } from '../../config/roles'

import type { ContentItem } from '../../types/domain'

type ContentHeader = { title: string; key: string; align: 'start' | 'end' | 'center'; mobileHide?: boolean }

interface Props {
  siteId?: string
  id?: string
}

const props = defineProps<Props>()
const selectedIds = defineModel<string[]>('selected', { default: () => [] })
const { state: filters, hasActiveFilters, sortByModel } = useContentFilters()

const contentStore = useContentStore()
const { preferences } = usePreferences()
const siteStore = useSiteStore()
const router = useRouter()
const { mobile } = useDisplay()
const page = ref(1)

const loading = computed(() => siteStore.loadingSites === true || contentStore.loading === true)
const permissions = computed(() => siteContentPermissions(siteStore.currentSite?.currentUserRole))
const canEditContent = computed(() => permissions.value.canEdit)
const headers = computed<ContentHeader[]>(() => [
  { title: 'Name', key: 'name', align: 'start' },
  { title: 'Size', key: 'size', align: 'start', mobileHide: true },
  { title: 'Updated', key: 'updatedAt', align: 'start', mobileHide: true },
])
const computedHeaders = computed(() =>
  mobile.value ? headers.value.filter(header => !header.mobileHide) : headers.value,
)

const contents = computed<ContentItem[]>(() =>
  [...contentStore.contents].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
)

const filteredContents = computed<ContentItem[]>(() => applyContentFilters(contents.value, filters))
const selectableContentIds = computed(() => filteredContents.value.map(item => item.id))
const allSelectableItemsSelected = computed(
  () =>
    selectableContentIds.value.length > 0 &&
    selectableContentIds.value.every(id => selectedIds.value.includes(id)),
)
const rowProps = (obj: { item: { id: string } }) =>
  selectedIds.value.includes(obj.item.id)
    ? { class: 'data-table-item-selected' }
    : { class: 'data-table-item' }

function getContentDisplayName(item: ContentItem): string {
  return item.name
}
function getContentTagItems(item: ContentItem) {
  return (item.tags ?? []).map((tag: string) => ({ key: tag, text: tag, color: 'secondary' }))
}
function toggleSelectAllItems(selected: boolean) {
  selectedIds.value = selected ? [...selectableContentIds.value] : []
}
/** Where a row leads: the file viewer, or the folder's content. */
function contentLocation(item: ContentItem): RouteLocationRaw {
  const siteId = props.siteId ?? item.site
  return item.kind === 'file'
    ? { name: 'file', params: { siteId, fileId: item.id } }
    : { name: 'site-folder-tab', params: { siteId, folderId: item.id, siteTab: 'content' } }
}
function navigateToContent(item: ContentItem) {
  void router.push(contentLocation(item))
}
function syncFolder() {
  if (!props.siteId) return
  contentStore.activeFolderId = props.id
}
watch(() => [props.siteId, props.id], syncFolder, { immediate: true })
watch(
  canEditContent,
  canEdit => {
    if (!canEdit) selectedIds.value = []
  },
  { immediate: true },
)
watch(
  () => ({ ...filters }),
  () => {
    page.value = 1
  },
  { deep: true },
)
</script>

<template>
  <div class="list-with-footer">
    <div class="list-scroll">
      <div class="data-table-wrapper">
        <VDataTable
          v-model:page="page"
          v-model:items-per-page="preferences.sitePageSize"
          v-model:sort-by="sortByModel"
          :items="filteredContents"
          :headers="computedHeaders"
          :loading="loading"
          width="100%"
          class="flex-grow-1 flex-shrink-1"
          :class="filteredContents.length === 0 && !loading ? 'no-data' : ''"
          :row-props="rowProps"
          return-object
          @click:row="(_event: Event, row: { item: ContentItem }) => navigateToContent(row.item)"
        >
          <template #header.name="{ column, toggleSort }">
            <div class="content-name-header" @click="toggleSort(column)">
              <IconCheckbox
                v-if="canEditContent"
                :model-value="allSelectableItemsSelected"
                :disabled="selectableContentIds.length === 0"
                :size="16"
                aria-label="Select all items"
                class="content-name-header__checkbox"
                @click.stop
                @update:model-value="toggleSelectAllItems(Boolean($event))"
              />
              <span class="content-name-header__label">Name</span>
            </div>
          </template>
          <template #item.name="{ item }">
            <template v-if="item.kind === 'file'">
              <ContentListItem :id="item.id" :prepend-icon="`fas ${item.attributes.icon}`">
                <template #text>
                  <div class="d-flex flex-column flex-sm-row align-sm-center">
                    <ItemLink :to="contentLocation(item)">{{ getContentDisplayName(item) }}</ItemLink>
                    <div
                      v-if="(item.tags ?? []).length > 0"
                      class="content-list-tags mt-1 mt-sm-0 ms-sm-2 min-w-0"
                    >
                      <TagOverflowRow :items="getContentTagItems(item)" size="x-small" />
                    </div>
                  </div>
                </template>
                <template v-if="canEditContent" #checkbox>
                  <!-- .stop: ticking a row must not also open it (the row itself navigates). -->
                  <IconCheckbox
                    :id="item.id"
                    v-model="selectedIds"
                    :size="16"
                    :aria-label="`Select ${item.name}`"
                    @click.stop
                  />
                </template>
                <template v-if="mobile" #subtitle>
                  {{
                    typeof item.updatedAt === 'string' ? DateTime.fromISO(item.updatedAt).toRelative() : ''
                  }}
                  {{ item.size || item.size === 0 ? `(${prettyBytes(item.size)})` : '' }}
                </template>
                <template #append><ContentInfoIcons :item="item" /></template>
              </ContentListItem>
            </template>
            <template v-else>
              <DropZone
                :id="item.id"
                :site-id="item.site"
                show-as-item
                disable-on-click
                :disable-on-drop="!permissions.canUpload"
                drop-style="folder"
                :prepend-icon="`fas ${item.attributes.icon}`"
                class="folder-drop-zone"
              >
                <template #text>
                  <div class="d-flex flex-column flex-sm-row align-sm-center">
                    <ItemLink :to="contentLocation(item)">{{ getContentDisplayName(item) }}</ItemLink>
                  </div>
                </template>
                <template v-if="canEditContent" #checkbox>
                  <!-- .stop: ticking a row must not also open it (the row itself navigates). -->
                  <IconCheckbox
                    :id="item.id"
                    v-model="selectedIds"
                    :size="16"
                    :aria-label="`Select ${item.name}`"
                    @click.stop
                  />
                </template>
                <template #append><ContentInfoIcons :item="item" /></template>
              </DropZone>
            </template>
          </template>
          <template #item.size="{ item }">
            <div class="text-secondary mx-2">
              {{ item.size || item.size === 0 ? prettyBytes(item.size) : 'Folder' }}
              <EncryptedPDFIcon :file="item" />
            </div>
          </template>
          <template #item.updatedAt="{ item }">
            <div class="text-secondary mx-2">
              {{ typeof item.updatedAt === 'string' ? DateTime.fromISO(item.updatedAt).toRelative() : '' }}
            </div>
          </template>
          <template #loading><ContentListLoadingState :rows="10" variant="content" /></template>
          <template #bottom />
          <template #no-data>
            <div v-if="hasActiveFilters && (contents.length ?? 0) > 0" class="text-medium-emphasis pa-4">
              No matching content.
            </div>
            <ContentEmptyState v-else :id="props.id" :site-id="props.siteId!" :loading="loading" />
          </template>
        </VDataTable>
      </div>
    </div>
    <div class="list-footer">
      <TableFooter
        v-model:page="page"
        v-model:items-per-page="preferences.sitePageSize"
        :items="filteredContents"
        item-label="Items"
      />
    </div>
  </div>
</template>

<style scoped>
.list-with-footer {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.list-scroll .data-table-wrapper {
  flex: 1;
  min-height: 0;
  margin-bottom: 0;
}

.data-table-wrapper :deep(.v-data-table-progress) {
  display: none;
}

.data-table-wrapper :deep(.v-data-table-rows-loading),
.data-table-wrapper :deep(.v-data-table-rows-loading td),
.data-table-wrapper :deep(.v-data-table-rows-loading .v-data-table__td) {
  vertical-align: middle;
}

.data-table-wrapper :deep(.v-data-table-rows-loading > td),
.data-table-wrapper :deep(.v-data-table-rows-loading .v-data-table__td) {
  padding: 0;
}

.data-table-wrapper :deep(.v-data-table-rows-loading .content-list-loading-state) {
  margin: 0;
}

.list-footer {
  flex-shrink: 0;
}

.content-list-tags :deep(.tag-overflow-row) {
  justify-content: flex-start;
}

.content-name-header {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  cursor: pointer;
}

.content-name-header__checkbox {
  flex: 0 0 auto;
}

.content-name-header__label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
</style>
